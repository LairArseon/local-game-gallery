import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
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

async function main() {
  const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptsDir, '..');

  const steps = [
    {
      label: 'full-desktop installer',
      command: 'npm',
      args: ['run', 'dist:win'],
    },
    {
      label: 'standalone-client installer',
      command: 'npm',
      args: ['run', 'dist:standalone-client:win'],
    },
    {
      label: 'bundle installer',
      command: 'npm',
      args: ['run', 'dist:bundle-installer:win'],
    },
  ];

  for (const step of steps) {
    console.log(`[package-all] starting ${step.label}...`);
    await runCommand(step.command, step.args, repoRoot);
    console.log(`[package-all] completed ${step.label}.`);
  }

  console.log('[package-all] all packaging steps completed successfully.');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[package-all] failed: ${message}`);
  process.exitCode = 1;
});
