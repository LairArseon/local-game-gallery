import { app, shell } from 'electron';
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LogEventPayload, OpenFolderResult } from '../src/types';

const maxLogSizeBytes = 15 * 1024 * 1024;
const trimTargetSizeBytes = 10 * 1024 * 1024;

function getLogDirectoryPath() {
  return path.join(app.getPath('userData'), 'logs');
}

function getLogFilePath() {
  return path.join(getLogDirectoryPath(), 'events.log');
}

function sanitizeLogMessage(message: string) {
  return message.replace(/\r?\n/g, ' ').trim();
}

async function ensureLogFileReady() {
  const logDirectory = getLogDirectoryPath();
  await mkdir(logDirectory, { recursive: true });
}

async function trimLogFileIfNeeded() {
  const logFilePath = getLogFilePath();

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
  await appendFile(getLogFilePath(), entry, 'utf8');
  await trimLogFileIfNeeded();
}

export async function readLogContents() {
  try {
    await ensureLogFileReady();
    return await readFile(getLogFilePath(), 'utf8');
  } catch {
    return '';
  }
}

export async function clearLogContents() {
  await ensureLogFileReady();
  await writeFile(getLogFilePath(), '', 'utf8');
}

export async function openLogFolder(): Promise<OpenFolderResult> {
  await ensureLogFileReady();
  const logDirectory = getLogDirectoryPath();
  const result = await shell.openPath(logDirectory);
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
