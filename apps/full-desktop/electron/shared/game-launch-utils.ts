import { spawn, type ChildProcess } from 'node:child_process';
import { appendFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import unzipper from 'unzipper';
import type { LaunchGameCandidate, PlayableVersion } from '../../src/types';
import {
  cleanupLaunchIsolationSession,
  createLaunchIsolationSession,
  type LaunchIsolationRequest,
} from './windows-firewall-isolation';

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

type LaunchExecutableOptions = {
  isolation?: LaunchIsolationRequest | null;
  onIsolationCleanupError?: (message: string) => Promise<void> | void;
  onLogEvent?: (event: { level: 'info' | 'warn' | 'error'; source: string; message: string }) => Promise<void> | void;
  onTrackedProcessExit?: (event: {
    executablePath: string;
    pid: number | null;
    startedAt: string;
    endedAt: string;
    durationMs: number;
    code: number | null;
    signal: NodeJS.Signals | null;
  }) => Promise<void> | void;
};

export type LaunchExecutableResult = {
  pid: number | null;
  isolationActive: boolean;
};

export async function launchExecutable(
  executablePath: string,
  options: LaunchExecutableOptions = {},
): Promise<LaunchExecutableResult> {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const appendLaunchLog = (event: { level: 'info' | 'warn' | 'error'; source: string; message: string }) => {
    return Promise.resolve(options.onLogEvent?.(event));
  };

  if (options.isolation?.enabled) {
    await appendLaunchLog({
      level: 'info',
      source: 'launch-isolation',
      message: `Preparing network isolation for executable "${executablePath}".`,
    }).catch(() => undefined);
  }

  const isolationSession = options.isolation
    ? await createLaunchIsolationSession(executablePath, options.isolation)
    : null;

  if (isolationSession) {
    await appendLaunchLog({
      level: 'info',
      source: 'launch-isolation',
      message: `Created firewall isolation rule group "${isolationSession.ruleGroup}" for "${executablePath}".`,
    }).catch(() => undefined);
  }

  let processHandle: ChildProcess;
  try {
    await appendLaunchLog({
      level: 'info',
      source: 'launch-process',
      message: `Spawning executable "${executablePath}".`,
    }).catch(() => undefined);

    processHandle = spawn(executablePath, [], {
      cwd: path.dirname(executablePath),
      stdio: 'ignore',
    });

    await new Promise<void>((resolve, reject) => {
      processHandle.once('spawn', () => resolve());
      processHandle.once('error', (error: Error) => reject(error));
    });

    await appendLaunchLog({
      level: 'info',
      source: 'launch-process',
      message: `Spawned executable "${executablePath}" with pid ${processHandle.pid ?? 'unknown'}.`,
    }).catch(() => undefined);
  } catch (error) {
    await appendLaunchLog({
      level: 'error',
      source: 'launch-process',
      message: `Failed to spawn executable "${executablePath}": ${error instanceof Error ? error.message : 'Unknown error.'}`,
    }).catch(() => undefined);

    if (isolationSession) {
      await appendLaunchLog({
        level: 'warn',
        source: 'launch-isolation',
        message: `Launch failed after creating firewall rules; attempting cleanup for rule group "${isolationSession.ruleGroup}".`,
      }).catch(() => undefined);

      await cleanupLaunchIsolationSession(isolationSession).catch(() => undefined);
    }
    throw error;
  }

  let trackedProcessExitHandled = false;
  const notifyTrackedProcessExit = (processHandle: ChildProcess, code: number | null, signal: NodeJS.Signals | null) => {
    if (trackedProcessExitHandled) {
      return;
    }

    trackedProcessExitHandled = true;
    const endedAtMs = Date.now();
    void Promise.resolve(options.onTrackedProcessExit?.({
      executablePath,
      pid: processHandle.pid ?? null,
      startedAt,
      endedAt: new Date(endedAtMs).toISOString(),
      durationMs: Math.max(0, endedAtMs - startedAtMs),
      code,
      signal,
    })).catch(() => undefined);
  };

  if (isolationSession) {
    const cleanup = (reason: 'exit' | 'error', code?: number | null, signal?: NodeJS.Signals | null) => {
      notifyTrackedProcessExit(processHandle, code ?? null, signal ?? null);
      void appendLaunchLog({
        level: reason === 'exit' ? 'info' : 'warn',
        source: 'launch-process',
        message: reason === 'exit'
          ? `Tracked launched process for "${executablePath}" exited with code ${code ?? 'null'}${signal ? ` and signal ${signal}` : ''}.`
          : `Tracked launched process for "${executablePath}" emitted an error event${signal ? ` (${signal})` : ''}.`,
      }).catch(() => undefined);

      void appendLaunchLog({
        level: 'info',
        source: 'launch-isolation',
        message: `Cleaning firewall isolation rule group "${isolationSession.ruleGroup}" for "${executablePath}".`,
      }).catch(() => undefined);

      void cleanupLaunchIsolationSession(isolationSession).then(() => {
        void appendLaunchLog({
          level: 'info',
          source: 'launch-isolation',
          message: `Removed firewall isolation rule group "${isolationSession.ruleGroup}" for "${executablePath}".`,
        }).catch(() => undefined);
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Failed to remove network isolation rules after launch.';
        void appendLaunchLog({
          level: 'error',
          source: 'launch-isolation',
          message: `Failed to clean firewall isolation rule group "${isolationSession.ruleGroup}": ${message}`,
        }).catch(() => undefined);
        void options.onIsolationCleanupError?.(message);
      });
    };

    processHandle.once('exit', (code, signal) => cleanup('exit', code, signal));
    processHandle.once('error', (error) => {
      void appendLaunchLog({
        level: 'error',
        source: 'launch-process',
        message: `Tracked launched process for "${executablePath}" emitted an error: ${error.message}`,
      }).catch(() => undefined);
      cleanup('error', null, null);
    });
  } else {
    processHandle.once('exit', (code, signal) => {
      notifyTrackedProcessExit(processHandle, code ?? null, signal ?? null);
      void appendLaunchLog({
        level: 'info',
        source: 'launch-process',
        message: `Tracked launched process for "${executablePath}" exited with code ${code ?? 'null'}${signal ? ` and signal ${signal}` : ''}.`,
      }).catch(() => undefined);
    });
    processHandle.once('error', (error) => {
      void appendLaunchLog({
        level: 'error',
        source: 'launch-process',
        message: `Tracked launched process for "${executablePath}" emitted an error: ${error.message}`,
      }).catch(() => undefined);
      notifyTrackedProcessExit(processHandle, null, null);
    });
  }

  processHandle.unref();
  return {
    pid: processHandle.pid ?? null,
    isolationActive: Boolean(isolationSession),
  };
}

export async function appendGameLaunchActivity(gamePath: string) {
  const activityLogPath = path.join(gamePath, 'activitylog');
  const timestamp = new Date().toISOString();
  await appendFile(activityLogPath, `${timestamp}\n`, 'utf8');
}
