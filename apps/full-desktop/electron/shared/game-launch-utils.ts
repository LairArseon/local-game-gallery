import { spawn } from 'node:child_process';
import { appendFile, readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Shared game-launch filesystem/process helpers for Electron entrypoints.
 *
 * New to this project: this module contains low-level launch utilities reused
 * by both desktop IPC and HTTP service handlers.
 */

export async function findExecutablesInFolder(folderPath: string): Promise<string[]> {
  const matches: string[] = [];

  const entries = await readdir(folderPath, { withFileTypes: true, encoding: 'utf8' }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    if (process.platform === 'win32' && path.extname(entry.name).toLowerCase() !== '.exe') {
      continue;
    }

    matches.push(path.join(folderPath, entry.name));
  }

  return matches;
}

export function toStoredExecutablePath(gamePath: string, executablePath: string) {
  const relativePath = path.relative(gamePath, executablePath);
  if (!relativePath || relativePath.startsWith('..')) {
    return executablePath;
  }

  return relativePath;
}

export function toExecutableAbsolutePath(gamePath: string, storedPath: string) {
  if (path.isAbsolute(storedPath)) {
    return storedPath;
  }

  return path.join(gamePath, storedPath);
}

export function launchExecutable(executablePath: string) {
  const processHandle = spawn(executablePath, [], {
    cwd: path.dirname(executablePath),
    detached: true,
    stdio: 'ignore',
  });
  processHandle.unref();
}

export async function appendGameLaunchActivity(gamePath: string) {
  const activityLogPath = path.join(gamePath, 'activitylog');
  const timestamp = new Date().toISOString();
  await appendFile(activityLogPath, `${timestamp}\n`, 'utf8');
}
