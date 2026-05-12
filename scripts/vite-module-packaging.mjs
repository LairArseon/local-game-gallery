import { readFileSync } from 'node:fs';
import path from 'node:path';

function normalizePathForComparison(value) {
  return path.resolve(value).replace(/\\/g, '/').toLowerCase();
}

function toViteFsPath(filePath) {
  return `/@fs/${path.resolve(filePath).replace(/\\/g, '/')}`;
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function normalizeManifestContribution(value) {
  return {
    id: String(value.id ?? '').trim(),
    slot: String(value.slot ?? '').trim(),
    title: String(value.title ?? '').trim() || undefined,
    description: String(value.description ?? '').trim() || undefined,
    order: typeof value.order === 'number' && Number.isFinite(value.order) ? value.order : undefined,
  };
}

function loadPackagedModules(repoRoot) {
  const packageJson = readJsonFile(path.join(repoRoot, 'package.json'));
  const appVersion = String(packageJson.version ?? '').trim() || '0.0.0';
  const moduleDescriptors = [
    {
      id: 'f95',
      entrySourcePath: path.join(repoRoot, 'apps', 'f95-module', 'module.ts'),
      manifestSourcePath: path.join(repoRoot, 'apps', 'f95-module', 'manifest.json'),
    },
  ];

  return moduleDescriptors.map((descriptor) => {
    const sourceManifest = readJsonFile(descriptor.manifestSourcePath);
    const manifest = {
      id: String(sourceManifest.id ?? descriptor.id).trim(),
      displayName: String(sourceManifest.displayName ?? descriptor.id).trim() || descriptor.id,
      description: String(sourceManifest.description ?? '').trim() || undefined,
      version: String(sourceManifest.version ?? '').trim() || appVersion,
      entry: './index.js',
      hostApiVersion: String(sourceManifest.hostApiVersion ?? '1').trim() || '1',
      installerComponentId: String(sourceManifest.installerComponentId ?? '').trim() || undefined,
      contributes: Array.isArray(sourceManifest.contributes)
        ? sourceManifest.contributes.map((contribution) => normalizeManifestContribution(contribution))
        : [],
    };

    return {
      ...descriptor,
      manifest,
      runtimeIndexManifest: {
        ...manifest,
        entry: `./${manifest.id}/index.js`,
      },
    };
  });
}

function createRuntimeModuleIndexSource(modules) {
  const manifests = modules.map((moduleEntry) => moduleEntry.runtimeIndexManifest);
  return [
    `const installedModuleManifests = ${JSON.stringify(manifests, null, 2)};`,
    'export { installedModuleManifests };',
    'export default installedModuleManifests;',
    '',
  ].join('\n');
}

function createDevModuleEntrySource(entrySourcePath) {
  const viteFsPath = toViteFsPath(entrySourcePath);
  return [
    `export { default, moduleEntry } from ${JSON.stringify(viteFsPath)};`,
    '',
  ].join('\n');
}

export function createPackagedModuleRollupInput({ repoRoot }) {
  return Object.fromEntries(
    loadPackagedModules(repoRoot).map((moduleEntry) => [`module-${moduleEntry.manifest.id}`, moduleEntry.entrySourcePath]),
  );
}

export function createPackagedModuleRollupOutput({ repoRoot, manualChunks }) {
  const modules = loadPackagedModules(repoRoot);
  const moduleEntryByFacadePath = new Map(
    modules.map((moduleEntry) => [normalizePathForComparison(moduleEntry.entrySourcePath), moduleEntry]),
  );

  return {
    entryFileNames(chunkInfo) {
      const facadeModuleId = chunkInfo.facadeModuleId ? normalizePathForComparison(chunkInfo.facadeModuleId) : '';
      const moduleEntry = moduleEntryByFacadePath.get(facadeModuleId);
      if (moduleEntry) {
        return `modules/${moduleEntry.manifest.id}/index.js`;
      }

      return 'assets/[name]-[hash].js';
    },
    chunkFileNames: 'assets/[name]-[hash].js',
    assetFileNames: 'assets/[name]-[hash][extname]',
    manualChunks,
  };
}

export function createPackagedModulePlugin({ repoRoot }) {
  const modules = loadPackagedModules(repoRoot);
  const runtimeModuleIndexSource = createRuntimeModuleIndexSource(modules);
  const manifestSourceByUrlPath = new Map(
    modules.map((moduleEntry) => [`/modules/${moduleEntry.manifest.id}/manifest.json`, JSON.stringify(moduleEntry.manifest, null, 2)]),
  );
  const entrySourceByUrlPath = new Map(
    modules.map((moduleEntry) => [`/modules/${moduleEntry.manifest.id}/index.js`, createDevModuleEntrySource(moduleEntry.entrySourcePath)]),
  );

  return {
    name: 'lgg-packaged-modules',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requestPath = String(req.url ?? '').split('?')[0];
        if (requestPath === '/modules/module-index.js') {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.end(runtimeModuleIndexSource);
          return;
        }

        const manifestSource = manifestSourceByUrlPath.get(requestPath);
        if (manifestSource) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(manifestSource);
          return;
        }

        const entrySource = entrySourceByUrlPath.get(requestPath);
        if (entrySource) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.end(entrySource);
          return;
        }

        next();
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'modules/module-index.js',
        source: runtimeModuleIndexSource,
      });

      for (const moduleEntry of modules) {
        this.emitFile({
          type: 'asset',
          fileName: `modules/${moduleEntry.manifest.id}/manifest.json`,
          source: `${JSON.stringify(moduleEntry.manifest, null, 2)}\n`,
        });
      }
    },
  };
}