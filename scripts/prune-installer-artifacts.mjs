import { readdir, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const args = {
    target: '',
    version: '',
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] ?? '').trim();
    if (token === '--target') {
      args.target = String(argv[index + 1] ?? '').trim().toLowerCase();
      index += 1;
      continue;
    }

    if (token === '--version') {
      args.version = String(argv[index + 1] ?? '').trim();
      index += 1;
      continue;
    }
  }

  return args;
}

function getTargetConfig(target, repoRoot) {
  if (target === 'full') {
    return {
      outputDir: path.join(repoRoot, 'release', 'full-desktop'),
      baseName: 'Local Game Gallery Setup',
    };
  }

  if (target === 'standalone') {
    return {
      outputDir: path.join(repoRoot, 'release', 'standalone-client'),
      baseName: 'Local Game Gallery Client Setup',
    };
  }

  if (target === 'bundle') {
    return {
      outputDir: path.join(repoRoot, 'release', 'bundle-installer'),
      baseName: 'Local Game Gallery Bundle Setup',
    };
  }

  return null;
}

async function resolveVersion(repoRoot, explicitVersion) {
  if (explicitVersion) {
    return explicitVersion;
  }

  const packageJsonPath = path.join(repoRoot, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const resolved = String(packageJson.version ?? '').trim();
  if (!resolved) {
    throw new Error('Could not resolve package version from package.json.');
  }

  return resolved;
}

function isCandidateFile(fileName, baseName) {
  const escapedBase = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedBase} .+\\.exe(?:\\.blockmap)?$`, 'i');
  return pattern.test(fileName);
}

function isCurrentVersionFile(fileName, baseName, version) {
  const escapedBase = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exePattern = new RegExp(`^${escapedBase} ${escapedVersion}\\.exe$`, 'i');
  const blockmapPattern = new RegExp(`^${escapedBase} ${escapedVersion}\\.exe\\.blockmap$`, 'i');
  return exePattern.test(fileName) || blockmapPattern.test(fileName);
}

async function pruneInstallerArtifacts({ outputDir, baseName, version }) {
  const entries = await readdir(outputDir, { withFileTypes: true }).catch(() => []);
  const removed = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const fileName = entry.name;
    if (!isCandidateFile(fileName, baseName)) {
      continue;
    }

    if (isCurrentVersionFile(fileName, baseName, version)) {
      continue;
    }

    const absolutePath = path.join(outputDir, fileName);
    await rm(absolutePath, { force: true });
    removed.push(fileName);
  }

  return removed;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.target) {
    throw new Error('Missing required argument --target <full|standalone|bundle>.');
  }

  const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptsDir, '..');

  const targetConfig = getTargetConfig(args.target, repoRoot);
  if (!targetConfig) {
    throw new Error(`Unsupported --target value: ${args.target}`);
  }

  const version = await resolveVersion(repoRoot, args.version);
  const removed = await pruneInstallerArtifacts({
    outputDir: targetConfig.outputDir,
    baseName: targetConfig.baseName,
    version,
  });

  if (!removed.length) {
    console.log(`[prune-installer-artifacts] ${args.target}: no stale installers to remove.`);
    return;
  }

  console.log(`[prune-installer-artifacts] ${args.target}: removed stale installers:`);
  for (const fileName of removed) {
    console.log(`  - ${fileName}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[prune-installer-artifacts] failed: ${message}`);
  process.exitCode = 1;
});
