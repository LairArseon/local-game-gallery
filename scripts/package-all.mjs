import { spawn } from 'node:child_process';
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: false,
      windowsHide: false,
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`));
    });
  });
}

async function ensureHelperReleaseAsset(repoRoot) {
  const helperSourcePath = path.join(
    repoRoot,
    'dist-electron',
    'electron',
    'isolation-helper',
    'LocalGameGallery.IsolationHelper.exe',
  );
  const helperManifestSourcePath = path.join(
    repoRoot,
    'dist-electron',
    'electron',
    'isolation-helper',
    'helper-version.json',
  );
  const helperReleaseDir = path.join(repoRoot, 'release', 'isolation-helper');
  const helperReleasePath = path.join(helperReleaseDir, 'LocalGameGallery.IsolationHelper.exe');
  const helperManifestReleasePath = path.join(helperReleaseDir, 'helper-version.json');

  for (const candidatePath of [helperSourcePath, helperManifestSourcePath]) {
    try {
      const sourceStat = await stat(candidatePath);
      if (!sourceStat.isFile()) {
        throw new Error('source path is not a file');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`missing isolation helper release source at ${candidatePath}: ${message}`);
    }
  }

  await rm(helperReleaseDir, { recursive: true, force: true });
  await mkdir(helperReleaseDir, { recursive: true });
  await cp(helperSourcePath, helperReleasePath, { force: true });
  await cp(helperManifestSourcePath, helperManifestReleasePath, { force: true });
  console.log(`[package-all] copied isolation helper release asset to ${helperReleasePath}.`);
  console.log(`[package-all] copied isolation helper version manifest to ${helperManifestReleasePath}.`);
}

async function main() {
  const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptsDir, '..');

  function npmRunStep(label, scriptName) {
    if (process.platform === 'win32') {
      return {
        label,
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'npm', 'run', scriptName],
      };
    }

    return {
      label,
      command: 'npm',
      args: ['run', scriptName],
    };
  }

  const steps = [
    npmRunStep('full-desktop installer', 'dist:win'),
    npmRunStep('standalone-client installer', 'dist:standalone-client:win'),
    npmRunStep('bundle installer', 'dist:bundle-installer:win'),
  ];

  for (const step of steps) {
    console.log(`[package-all] starting ${step.label}...`);
    await runCommand(step.command, step.args, repoRoot);
    console.log(`[package-all] completed ${step.label}.`);
  }

  await ensureHelperReleaseAsset(repoRoot);

  console.log('[package-all] all packaging steps completed successfully.');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[package-all] failed: ${message}`);
  process.exitCode = 1;
});
