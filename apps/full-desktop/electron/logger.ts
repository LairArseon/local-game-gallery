import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LogEventPayload, OpenFolderResult } from '../src/types';
import { resolveGalleryDataPath } from './runtime-paths';

const maxLogSizeBytes = 15 * 1024 * 1024;
const trimTargetSizeBytes = 10 * 1024 * 1024;

async function getLogDirectoryPath() {
  const dataPath = await resolveGalleryDataPath();
  return path.join(dataPath, 'logs');
}

async function getLogFilePath() {
  return path.join(await getLogDirectoryPath(), 'events.log');
}

function sanitizeLogMessage(message: string) {
  return message.replace(/\r?\n/g, ' ').trim();
}

async function ensureLogFileReady() {
  const logDirectory = await getLogDirectoryPath();
  await mkdir(logDirectory, { recursive: true });
}

async function trimLogFileIfNeeded() {
  const logFilePath = await getLogFilePath();

  let logStats: Awaited<ReturnType<typeof stat>> | null = null;
  try {
    logStats = await stat(logFilePath);
  } catch {
    return;
  }

  if (!logStats || logStats.size <= maxLogSizeBytes) {
    return;
  }

  const fileContents = await readFile(logFilePath);
  const offset = Math.max(0, fileContents.length - trimTargetSizeBytes);
  const trimmedContents = fileContents.subarray(offset);
  await writeFile(logFilePath, trimmedContents);
}

export async function appendLogEvent(payload: LogEventPayload) {
  const timestamp = new Date().toISOString();
  const level = (payload.level ?? 'info').toUpperCase();
  const source = payload.source?.trim() || 'app';
  const message = sanitizeLogMessage(payload.message || '');
  if (!message) {
    return;
  }

  await ensureLogFileReady();
  const entry = `[${timestamp}] [${level}] [${source}] ${message}\n`;
  await appendFile(await getLogFilePath(), entry, 'utf8');
  await trimLogFileIfNeeded();
}

export async function readLogContents() {
  try {
    await ensureLogFileReady();
    return await readFile(await getLogFilePath(), 'utf8');
  } catch {
    return '';
  }
}

export async function clearLogContents() {
  await ensureLogFileReady();
  await writeFile(await getLogFilePath(), '', 'utf8');
}

export async function openLogFolder(): Promise<OpenFolderResult> {
  await ensureLogFileReady();
  const logDirectory = await getLogDirectoryPath();

  if (!process.versions.electron) {
    return {
      opened: false,
      message: 'Opening the log folder is only available in desktop runtime.',
    };
  }

  const electronModule = await import('electron') as unknown as {
    shell?: {
      openPath: (targetPath: string) => Promise<string>;
    };
  };

  const runtimeShell = electronModule.shell;
  if (!runtimeShell) {
    return {
      opened: false,
      message: 'Desktop shell integration is unavailable in this runtime.',
    };
  }

  const result = await runtimeShell.openPath(logDirectory);
  if (result) {
    return {
      opened: false,
      message: result,
    };
  }

  return {
    opened: true,
    message: `Opened logs folder: ${logDirectory}`,
  };
}
