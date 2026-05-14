import { spawn } from 'node:child_process';
import { appendFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import unzipper from 'unzipper';
import type { LaunchGameCandidate, PlayableVersion } from '../../src/types';

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

async function findExecutablesInArchive(archivePath: string): Promise<string[]> {
  if (path.extname(archivePath).toLowerCase() !== '.zip') {
    return [];
  }

  const directory = await unzipper.Open.file(archivePath).catch(() => null);
  if (!directory) {
    return [];
  }

  return directory.files
    .filter((entry) => entry.type !== 'Directory')
    .map((entry) => String(entry.path ?? '').replace(/\\/g, '/').trim())
    .filter((entryPath) => {
      if (!entryPath || entryPath.startsWith('../') || entryPath.includes('/')) {
        return false;
      }

      return process.platform !== 'win32' || path.extname(entryPath).toLowerCase() === '.exe';
    });
}

function toNormalizedRelativeExecutablePath(versionPath: string, executablePath: string) {
  return path.relative(versionPath, executablePath).replace(/\\/g, '/');
}

type LaunchVersionLike = Pick<PlayableVersion, 'name' | 'path' | 'storageState' | 'storageArchivePath'>;

export async function listLaunchCandidates(
  gamePath: string,
  versions: LaunchVersionLike[],
  versionPaths?: string[],
): Promise<LaunchGameCandidate[]> {
  const resolvedGamePath = path.resolve(gamePath);
  const versionPathFilter = new Set(
    (versionPaths ?? [])
      .map((entry) => path.resolve(String(entry ?? '').trim()))
      .filter(Boolean),
  );
  const selectedVersions = versions.filter((version) => {
    const resolvedVersionPath = path.resolve(String(version.path ?? '').trim());
    return resolvedVersionPath && (!versionPathFilter.size || versionPathFilter.has(resolvedVersionPath));
  });
  const candidates: LaunchGameCandidate[] = [];

  for (const version of selectedVersions) {
    const resolvedVersionPath = path.resolve(String(version.path ?? '').trim());
    if (!resolvedVersionPath) {
      continue;
    }

    const relativeExecutablePaths = version.storageState === 'compressed'
      ? await findExecutablesInArchive(String(version.storageArchivePath ?? '').trim())
      : (await findExecutablesInFolder(resolvedVersionPath)).map((candidatePath) => toNormalizedRelativeExecutablePath(resolvedVersionPath, candidatePath));

    for (const relativeExecutablePath of relativeExecutablePaths.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))) {
      if (!relativeExecutablePath || relativeExecutablePath.startsWith('..')) {
        continue;
      }

      const executablePath = path.join(resolvedVersionPath, ...relativeExecutablePath.split('/'));
      candidates.push({
        versionName: version.name,
        versionPath: resolvedVersionPath,
        executableName: path.basename(relativeExecutablePath),
        executablePath,
        relativeExecutablePath,
        storedExecutablePath: toStoredExecutablePath(resolvedGamePath, executablePath),
        storageState: version.storageState ?? 'decompressed',
        requiresDecompression: version.storageState === 'compressed',
      });
    }
  }

  return [...new Map(candidates.map((candidate) => [`${candidate.versionPath}::${candidate.relativeExecutablePath}`.toLowerCase(), candidate])).values()];
}

export function resolveLaunchVersionForExecutable(executablePath: string, versions: LaunchVersionLike[]) {
  const resolvedExecutablePath = path.resolve(executablePath);
  return versions.find((version) => {
    const resolvedVersionPath = path.resolve(String(version.path ?? '').trim());
    const relativePath = path.relative(resolvedVersionPath, resolvedExecutablePath);
    return Boolean(relativePath) && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
  }) ?? null;
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
