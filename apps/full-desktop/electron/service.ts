/**
 * HTTP service host for browser/mobile gallery access over LAN/Tailscale.
 *
 * New to this project: this module exposes transport-safe endpoints that mirror
 * core desktop IPC operations so non-Electron clients can use shared contracts.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { spawn } from 'node:child_process';
import { appendFile, copyFile, cp, mkdtemp, mkdir, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  type GameMetadata,
  type GalleryConfig,
  type ImportStagedGameArchiveResult,
  type LogEventPayload,
  type OpenFolderPayload,
  type OpenFolderResult,
  type PlayGamePayload,
  type PlayGameResult,
  type RemoveScreenshotPayload,
  type ReorderScreenshotsPayload,
  type ScanRequestOptions,
  type SaveGameMetadataPayload,
  type CompressGameVersionPayload,
  type CompressGameVersionResult,
  type DecompressGameVersionPayload,
  type DecompressGameVersionResult,
  type ScanResult,
  type ServiceApiVersionInfo,
  type ServiceCapabilities,
  type ServiceHealthStatus,
} from '../src/types';
import { loadConfig, saveConfig } from './config';
import { getLatestVersionName, readGameMetadata, reorderScreenshots, removeScreenshot, saveGameMetadata } from './game-library';
import { appendLogEvent, clearLogContents, openLogFolder, readLogContents } from './logger';
import { scanGame, scanGames } from './scanner';

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

type ApiFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

type StartGalleryHttpServiceArgs = {
  appVersion: string;
  startedAt: string;
  host?: string;
  port?: number;
};

type UploadMediaFilePayload = {
  name: string;
  mimeType?: string;
  dataBase64: string;
};

type UploadGameMediaPayload = {
  gamePath: string;
  target: 'poster' | 'card' | 'background' | 'screenshot';
  files: UploadMediaFilePayload[];
};

type StageArchiveUploadPayload = {
  fileName: string;
  mimeType?: string;
  dataBase64?: string;
  filePath?: string;
};

type CancelArchiveUploadPayload = {
  uploadId: string;
};

type ImportArchiveUploadPayload = {
  uploadId: string;
  gameName: string;
  versionName: string;
  existingGamePath?: string;
  metadata?: GameMetadata;
};

type HostDialogOptions = {
  properties: string[];
  title: string;
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
};

type HostDialogResult = {
  canceled: boolean;
  filePaths: string[];
};

type HostDialogApi = {
  showOpenDialog: (options: HostDialogOptions) => Promise<HostDialogResult>;
};

type HostDialogModule = {
  dialog?: HostDialogApi;
  default?: unknown;
};

export type GalleryHttpService = {
  stop: () => Promise<void>;
  getHealth: () => ServiceHealthStatus;
  getCapabilities: () => ServiceCapabilities;
  getApiVersion: () => ServiceApiVersionInfo;
  getBaseUrl: () => string;
};

const jsonBodyLimitBytes = 25 * 1024 * 1024;
const envHost = String(process.env.LGG_SERVICE_HOST ?? '').trim();
const envPort = Number.parseInt(String(process.env.LGG_SERVICE_PORT ?? ''), 10);
const envRuntimeContext = String(process.env.LGG_RUNTIME_CONTEXT ?? '').trim().toLowerCase();
const isContainerizedRuntime = envRuntimeContext === 'docker';
const containerGamesRoot = '/games';
const containerMetadataMirrorRoot = '/metadata-mirror';
const defaultHost = envHost || '0.0.0.0';
const defaultPort = Number.isFinite(envPort) && envPort > 0 ? envPort : 37995;
const imageContentTypes = new Map<string, string>([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.bmp', 'image/bmp'],
]);
const imageMimeToExtension = new Map<string, string>([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/bmp', '.bmp'],
]);
const stagedArchiveUploads = new Map<string, { filePath: string; originalFileName: string }>();
const versionStorageBaseName = 'storage_compresion';
const versionStorageArchivePattern = /^storage_compresion\.[^.]+$/i;
const versionMetadataFilePattern = /\.nfo$/i;

type VersionStorageArchiveInfo = {
  archivePath: string;
  extension: string;
};

function normalizeIpAddress(value: string | undefined) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) {
    return '';
  }

  const withoutScope = raw.split('%')[0] ?? raw;
  if (withoutScope.startsWith('::ffff:')) {
    return withoutScope.slice('::ffff:'.length);
  }

  return withoutScope;
}

function collectLocalAddresses() {
  const addresses = new Set<string>(['127.0.0.1', '::1']);
  const interfaces = os.networkInterfaces();

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      addresses.add(normalizeIpAddress(entry.address));
    }
  }

  return addresses;
}

const localHostAddresses = collectLocalAddresses();

function isRequestFromSameMachine(request: IncomingMessage) {
  const remoteAddress = normalizeIpAddress(request.socket.remoteAddress);
  if (!remoteAddress) {
    return false;
  }

  return localHostAddresses.has(remoteAddress);
}

function withCorsHeaders(response: ServerResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson<T>(response: ServerResponse, statusCode: number, payload: ApiSuccess<T> | ApiFailure) {
  withCorsHeaders(response);
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

function sendOk<T>(response: ServerResponse, data: T, statusCode = 200) {
  sendJson(response, statusCode, {
    ok: true,
    data,
  });
}

function sendError(response: ServerResponse, statusCode: number, code: string, message: string) {
  sendJson(response, statusCode, {
    ok: false,
    error: {
      code,
      message,
    },
  });
}

function sendNoContent(response: ServerResponse) {
  withCorsHeaders(response);
  response.statusCode = 204;
  response.end();
}

async function readJsonBody<T>(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const rawChunk of request) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    totalBytes += chunk.length;
    if (totalBytes > jsonBodyLimitBytes) {
      throw new Error('Request body exceeds the maximum allowed size.');
    }

    chunks.push(chunk);
  }

  if (!chunks.length) {
    throw new Error('Request body is required.');
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

function normalizeHost(value: string | undefined) {
  const trimmed = String(value ?? '').trim();
  return trimmed || defaultHost;
}

function normalizePort(value: number | undefined) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }

  return defaultPort;
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function parseRequestUrl(request: IncomingMessage, fallbackHost: string, fallbackPort: number) {
  const hostHeader = request.headers.host?.trim() || `${fallbackHost}:${fallbackPort}`;
  return new URL(request.url ?? '/', `http://${hostHeader}`);
}

function toDownloadSafeFileName(value: string) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return 'download';
  }

  return normalized.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
}

function toAsciiHeaderFileName(value: string) {
  const normalized = toDownloadSafeFileName(value)
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/"/g, '_')
    .trim();

  return normalized || 'download';
}

function buildAttachmentContentDisposition(fileName: string) {
  const safeName = toDownloadSafeFileName(fileName);
  const asciiFallback = toAsciiHeaderFileName(fileName);
  const encodedUtf8 = encodeURIComponent(safeName).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedUtf8}`;
}

async function createZipFromFolder(folderPath: string, outputZipPath: string) {
  if (process.platform !== 'win32') {
    throw new Error('Folder download compression is currently supported on Windows hosts only.');
  }

  const folderArg = `'${folderPath.replace(/'/g, "''")}'`;
  const outputArg = `'${outputZipPath.replace(/'/g, "''")}'`;
  const command = [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    `if (Test-Path -LiteralPath ${outputArg}) { Remove-Item -LiteralPath ${outputArg} -Force }`,
    `[System.IO.Compression.ZipFile]::CreateFromDirectory(${folderArg}, ${outputArg}, [System.IO.Compression.CompressionLevel]::Optimal, $true)`,
  ].join('; ');

  await new Promise<void>((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk ?? '');
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk ?? '');
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const stdoutText = stdout.trim();
      const stderrText = stderr.trim();
      reject(new Error(
        stderrText
        || stdoutText
        || `Compression failed with exit code ${code}.`,
      ));
    });
  });
}

async function extractZipToFolder(zipPath: string, outputFolderPath: string) {
  if (process.platform !== 'win32') {
    throw new Error('Archive extraction is currently supported on Windows hosts only.');
  }

  const zipArg = `'${zipPath.replace(/'/g, "''")}'`;
  const outputArg = `'${outputFolderPath.replace(/'/g, "''")}'`;
  const command = [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    `if (Test-Path -LiteralPath ${outputArg}) { Remove-Item -LiteralPath ${outputArg} -Recurse -Force }`,
    `New-Item -ItemType Directory -Path ${outputArg} -Force | Out-Null`,
    `[System.IO.Compression.ZipFile]::ExtractToDirectory(${zipArg}, ${outputArg})`,
  ].join('; ');

  await new Promise<void>((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      windowsHide: true,
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk ?? '');
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `Extraction failed with exit code ${code}.`));
    });
  });
}

function toSafeFolderName(value: string, fallback: string) {
  const safe = toDownloadSafeFileName(value)
    .replace(/[. ]+$/g, '')
    .trim();

  return safe || fallback;
}

function toDefaultImportMetadata(versionName: string) {
  return {
    latestVersion: versionName,
    score: '',
    status: '',
    description: '',
    notes: [] as string[],
    tags: [] as string[],
    launchExecutable: '',
    customTags: [] as Array<{ key: string; value: string }>,
  };
}

async function removeStagedArchiveUpload(uploadId: string) {
  const staged = stagedArchiveUploads.get(uploadId);
  if (!staged) {
    return;
  }

  stagedArchiveUploads.delete(uploadId);
  await unlink(staged.filePath).catch(() => undefined);
}

async function copyExtractedArchiveIntoVersion(extractedRootPath: string, targetVersionPath: string) {
  const extractedEntries = (await readdir(extractedRootPath, { withFileTypes: true }))
    .filter((entry) => entry.name !== '__MACOSX');

  if (!extractedEntries.length) {
    throw new Error('Archive does not contain importable files.');
  }

  let sourceRoot = extractedRootPath;
  if (extractedEntries.length === 1 && extractedEntries[0]?.isDirectory()) {
    sourceRoot = path.join(extractedRootPath, extractedEntries[0].name);
  }

  const existingEntries = await readdir(targetVersionPath).catch(() => []);
  if (existingEntries.length > 0) {
    throw new Error('Target version folder already contains files. Choose another version name.');
  }

  const entriesToCopy = await readdir(sourceRoot, { withFileTypes: true });
  for (const entry of entriesToCopy) {
    const sourcePath = path.join(sourceRoot, entry.name);
    const destinationPath = path.join(targetVersionPath, entry.name);
    if (entry.isDirectory()) {
      await cp(sourcePath, destinationPath, { recursive: true, force: true, errorOnExist: false });
      continue;
    }

    if (entry.isFile()) {
      await copyFile(sourcePath, destinationPath);
    }
  }
}

async function resolveVersionStorageArchive(versionPath: string): Promise<VersionStorageArchiveInfo | null> {
  const entries = await readdir(versionPath, { withFileTypes: true }).catch(() => []);
  const archiveEntry = entries.find((entry) => entry.isFile() && versionStorageArchivePattern.test(entry.name));
  if (!archiveEntry) {
    return null;
  }

  const extension = path.extname(archiveEntry.name).replace('.', '').toLowerCase() || 'zip';
  return {
    archivePath: path.join(versionPath, archiveEntry.name),
    extension,
  };
}

async function listRuntimeVersionEntries(versionPath: string) {
  const entries = await readdir(versionPath, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => {
    if (!(entry.isFile() || entry.isDirectory())) {
      return false;
    }

    if (versionStorageArchivePattern.test(entry.name)) {
      return false;
    }

    if (entry.isFile() && versionMetadataFilePattern.test(entry.name)) {
      return false;
    }

    return true;
  });
}

async function compressVersionForStorage(
  gamePath: string,
  versionPath: string,
  versionName: string,
  source: string,
): Promise<CompressGameVersionResult> {
  const resolvedGamePath = path.resolve(gamePath);
  const resolvedVersionPath = path.resolve(versionPath);

  if (!isPathInside(resolvedGamePath, resolvedVersionPath)) {
    throw new Error('Invalid version compression path.');
  }

  const versionStats = await stat(resolvedVersionPath).catch(() => null);
  if (!versionStats?.isDirectory()) {
    throw new Error('Selected version folder was not found on disk.');
  }

  const runtimeEntries = await listRuntimeVersionEntries(resolvedVersionPath);
  const existingArchive = await resolveVersionStorageArchive(resolvedVersionPath);

  if (!runtimeEntries.length && existingArchive) {
    const archiveStats = await stat(existingArchive.archivePath).catch(() => null);
    return {
      compressed: true,
      archivePath: existingArchive.archivePath,
      archiveSizeBytes: archiveStats?.size ?? 0,
      message: `${versionName} is already compressed.`,
    };
  }

  if (!runtimeEntries.length) {
    throw new Error('Version folder has no compressible files.');
  }

  const archiveExtension = existingArchive?.extension || 'zip';
  const archiveFileName = `${versionStorageBaseName}.${archiveExtension}`;
  const archiveOutputPath = path.join(resolvedVersionPath, archiveFileName);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'lgg-version-compress-'));
  const tempPayloadRoot = path.join(tempDir, 'payload');
  const tempArchivePath = path.join(tempDir, archiveFileName);

  await appendLogEvent({
    level: 'info',
    source,
    message: `Compression requested for version "${versionName}" at "${resolvedVersionPath}" (${runtimeEntries.length} entries).`,
  }).catch(() => undefined);

  try {
    await mkdir(tempPayloadRoot, { recursive: true });

    for (const entry of runtimeEntries) {
      const sourcePath = path.join(resolvedVersionPath, entry.name);
      const destinationPath = path.join(tempPayloadRoot, entry.name);
      if (entry.isDirectory()) {
        await cp(sourcePath, destinationPath, { recursive: true, force: true, errorOnExist: false });
        continue;
      }

      if (entry.isFile()) {
        await copyFile(sourcePath, destinationPath);
      }
    }

    await createZipFromFolder(tempPayloadRoot, tempArchivePath);
    await copyFile(tempArchivePath, archiveOutputPath);

    for (const entry of runtimeEntries) {
      const targetPath = path.join(resolvedVersionPath, entry.name);
      if (entry.isDirectory()) {
        await rm(targetPath, { recursive: true, force: true });
      } else {
        await unlink(targetPath).catch(() => undefined);
      }
    }

    const archiveStats = await stat(archiveOutputPath).catch(() => null);
    await appendLogEvent({
      level: 'info',
      source,
      message: `Compression completed for "${resolvedVersionPath}" -> "${archiveOutputPath}" (${archiveStats?.size ?? 0} bytes).`,
    }).catch(() => undefined);

    return {
      compressed: true,
      archivePath: archiveOutputPath,
      archiveSizeBytes: archiveStats?.size ?? 0,
      message: `Compressed ${versionName}.`,
    };
  } catch (error) {
    const message = toErrorMessage(error, 'Unknown compression error.');
    await appendLogEvent({
      level: 'error',
      source,
      message: `Compression failed for "${resolvedVersionPath}": ${message}`,
    }).catch(() => undefined);
    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function decompressVersionFromStorage(
  gamePath: string,
  versionPath: string,
  versionName: string,
  source: string,
): Promise<DecompressGameVersionResult> {
  const resolvedGamePath = path.resolve(gamePath);
  const resolvedVersionPath = path.resolve(versionPath);

  if (!isPathInside(resolvedGamePath, resolvedVersionPath)) {
    throw new Error('Invalid version decompression path.');
  }

  const versionStats = await stat(resolvedVersionPath).catch(() => null);
  if (!versionStats?.isDirectory()) {
    throw new Error('Selected version folder was not found on disk.');
  }

  const archiveInfo = await resolveVersionStorageArchive(resolvedVersionPath);
  if (!archiveInfo) {
    return {
      decompressed: true,
      extractedEntries: 0,
      message: `${versionName} is already decompressed.`,
    };
  }

  const existingRuntimeEntries = await listRuntimeVersionEntries(resolvedVersionPath);
  if (existingRuntimeEntries.length) {
    throw new Error('Version already has runtime files. Manual cleanup is required before decompression.');
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'lgg-version-decompress-'));
  const extractRoot = path.join(tempDir, 'extract');
  await appendLogEvent({
    level: 'info',
    source,
    message: `Decompression requested for version "${versionName}" from "${archiveInfo.archivePath}".`,
  }).catch(() => undefined);

  try {
    await extractZipToFolder(archiveInfo.archivePath, extractRoot);
    const extractedEntries = (await readdir(extractRoot, { withFileTypes: true }))
      .filter((entry) => entry.name !== '__MACOSX');

    let sourceRoot = extractRoot;
    if (extractedEntries.length === 1 && extractedEntries[0]?.isDirectory()) {
      sourceRoot = path.join(extractRoot, extractedEntries[0].name);
    }

    const entriesToCopy = await readdir(sourceRoot, { withFileTypes: true });

    for (const entry of entriesToCopy) {
      const sourcePath = path.join(sourceRoot, entry.name);
      const destinationPath = path.join(resolvedVersionPath, entry.name);
      if (entry.isDirectory()) {
        await cp(sourcePath, destinationPath, { recursive: true, force: true, errorOnExist: false });
        continue;
      }

      if (entry.isFile()) {
        await copyFile(sourcePath, destinationPath);
      }
    }

    await unlink(archiveInfo.archivePath).catch(() => undefined);
    await appendLogEvent({
      level: 'info',
      source,
      message: `Decompression completed for "${resolvedVersionPath}" (${extractedEntries.length} extracted entries).`,
    }).catch(() => undefined);

    return {
      decompressed: true,
      extractedEntries: entriesToCopy.length,
      message: `Decompressed ${versionName}.`,
    };
  } catch (error) {
    const message = toErrorMessage(error, 'Unknown decompression error.');
    await appendLogEvent({
      level: 'error',
      source,
      message: `Decompression failed for "${resolvedVersionPath}": ${message}`,
    }).catch(() => undefined);
    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function isPathInside(parentPath: string, targetPath: string) {
  const relative = path.relative(parentPath, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveImageContentType(filePath: string) {
  return imageContentTypes.get(path.extname(filePath).toLowerCase()) ?? null;
}

function resolveUploadExtension(fileName: string, mimeType?: string) {
  const extensionFromName = path.extname(fileName).toLowerCase();
  if (imageContentTypes.has(extensionFromName)) {
    return extensionFromName;
  }

  const normalizedMimeType = String(mimeType ?? '').trim().toLowerCase();
  return imageMimeToExtension.get(normalizedMimeType) ?? null;
}

function decodeBase64File(payload: UploadMediaFilePayload) {
  const base64 = String(payload.dataBase64 ?? '').trim();
  if (!base64) {
    throw new Error(`Uploaded file "${payload.name}" is empty.`);
  }

  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) {
    throw new Error(`Uploaded file "${payload.name}" could not be decoded.`);
  }

  return buffer;
}

function nextScreenshotIndex(entries: string[]) {
  const maxExistingIndex = entries.reduce((maxValue, entryName) => {
    const parsed = path.parse(entryName);
    const match = parsed.name.match(/^screen(\d+)$/i);
    if (!match) {
      return maxValue;
    }

    const indexValue = Number.parseInt(match[1] ?? '0', 10);
    return Number.isFinite(indexValue) ? Math.max(maxValue, indexValue) : maxValue;
  }, 0);

  return maxExistingIndex + 1;
}

function resolveAllowedGalleryRoots(config: GalleryConfig) {
  const configuredRoots = [
    String(config.gamesRoot ?? '').trim(),
    String(config.metadataMirrorRoot ?? '').trim(),
  ].filter(Boolean);

  const uniqueResolvedRoots = new Set(configuredRoots.map((rootPath) => path.resolve(rootPath)));
  return [...uniqueResolvedRoots];
}

function isPathInsideAllowedGalleryRoots(targetPath: string, config: GalleryConfig) {
  for (const resolvedRoot of resolveAllowedGalleryRoots(config)) {
    if (isPathInside(resolvedRoot, targetPath)) {
      return true;
    }
  }

  return false;
}

function isAllowedMediaPath(targetPath: string, config: GalleryConfig) {
  if (isPathInsideAllowedGalleryRoots(targetPath, config)) {
    return true;
  }

  const iconPath = String(config.appIconPngPath ?? '').trim();
  if (iconPath && path.resolve(iconPath) === targetPath) {
    return true;
  }

  return false;
}

async function fileExists(filePath: string) {
  try {
    const fileStats = await stat(filePath);
    return fileStats.isFile();
  } catch {
    return false;
  }
}

async function findExecutablesInFolder(folderPath: string): Promise<string[]> {
  const matches: string[] = [];

  const entries = await readdir(folderPath, { withFileTypes: true, encoding: 'utf8' }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    if (process.platform === 'win32') {
      if (path.extname(entry.name).toLowerCase() !== '.exe') {
        continue;
      }
    }

    matches.push(path.join(folderPath, entry.name));
  }

  return matches;
}

function toStoredExecutablePath(gamePath: string, executablePath: string) {
  const relativePath = path.relative(gamePath, executablePath);
  if (!relativePath || relativePath.startsWith('..')) {
    return executablePath;
  }

  return relativePath;
}

function toExecutableAbsolutePath(gamePath: string, storedPath: string) {
  if (path.isAbsolute(storedPath)) {
    return storedPath;
  }

  return path.join(gamePath, storedPath);
}

function launchExecutable(executablePath: string) {
  const processHandle = spawn(executablePath, [], {
    cwd: path.dirname(executablePath),
    detached: true,
    stdio: 'ignore',
  });
  processHandle.unref();
}

async function appendGameLaunchActivity(gamePath: string) {
  const activityLogPath = path.join(gamePath, 'activitylog');
  const timestamp = new Date().toISOString();
  await appendFile(activityLogPath, `${timestamp}\n`, 'utf8');
}

async function openFolderInSystemShell(folderPath: string): Promise<OpenFolderResult> {
  const resolvedFolderPath = path.resolve(String(folderPath ?? '').trim());
  if (!resolvedFolderPath) {
    return {
      opened: false,
      message: 'Folder path is required.',
    };
  }

  try {
    const folderStats = await stat(resolvedFolderPath);
    if (!folderStats.isDirectory()) {
      return {
        opened: false,
        message: 'Folder path is not a directory.',
      };
    }
  } catch {
    return {
      opened: false,
      message: 'Folder path does not exist.',
    };
  }

  try {
    const command = process.platform === 'win32'
      ? 'explorer.exe'
      : process.platform === 'darwin'
        ? 'open'
        : 'xdg-open';

    const child = spawn(command, [resolvedFolderPath], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    await appendLogEvent({
      level: 'info',
      source: 'http-service-open-folder',
      message: `Opened folder "${resolvedFolderPath}"`,
    }).catch(() => undefined);

    return {
      opened: true,
      message: `Opened folder: ${resolvedFolderPath}`,
    };
  } catch (error) {
    const message = toErrorMessage(error, 'Failed to open folder.');
    await appendLogEvent({
      level: 'error',
      source: 'http-service-open-folder',
      message: `Failed opening folder "${resolvedFolderPath}": ${message}`,
    }).catch(() => undefined);

    return {
      opened: false,
      message,
    };
  }
}

function resolveHostDialogApi(moduleValue: HostDialogModule): HostDialogApi | null {
  if (moduleValue.dialog && typeof moduleValue.dialog.showOpenDialog === 'function') {
    return moduleValue.dialog;
  }

  if (moduleValue.default && typeof moduleValue.default === 'object') {
    const maybeDialog = (moduleValue.default as { dialog?: HostDialogApi }).dialog;
    if (maybeDialog && typeof maybeDialog.showOpenDialog === 'function') {
      return maybeDialog;
    }
  }

  return null;
}

async function pickFolderFromHostDialog(title: string) {
  if (!process.versions.electron) {
    throw new Error('Host folder picker is unavailable in this runtime.');
  }

  const electronModule = await import('electron') as HostDialogModule;
  const dialogApi = resolveHostDialogApi(electronModule);
  if (!dialogApi) {
    throw new Error('Host folder picker API is unavailable.');
  }

  const result = await dialogApi.showOpenDialog({
    properties: ['openDirectory'],
    title,
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0] ?? null;
}

async function pickArchiveUploadFileFromHostDialog() {
  if (!process.versions.electron) {
    throw new Error('Host archive picker is unavailable in this runtime.');
  }

  const electronModule = await import('electron') as HostDialogModule;
  const dialogApi = resolveHostDialogApi(electronModule);
  if (!dialogApi) {
    throw new Error('Host archive picker API is unavailable.');
  }

  const result = await dialogApi.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'ZIP archives', extensions: ['zip'] },
      { name: 'All files', extensions: ['*'] },
    ],
    title: 'Choose game archive',
  });

  if (result.canceled) {
    return null;
  }

  const selectedPath = String(result.filePaths[0] ?? '').trim();
  if (!selectedPath) {
    return null;
  }

  const fileStats = await stat(selectedPath);
  if (!fileStats.isFile()) {
    throw new Error('Selected archive path is not a file.');
  }

  return {
    filePath: selectedPath,
    fileName: path.basename(selectedPath),
    sizeBytes: fileStats.size,
  };
}

async function launchGameFromService(payload: PlayGamePayload): Promise<PlayGameResult> {
  const rawGamePath = String(payload.gamePath ?? '').trim();
  if (!rawGamePath) {
    return {
      launched: false,
      executablePath: null,
      message: 'Game path is required.',
    };
  }

  const resolvedGamePath = path.resolve(rawGamePath);
  const gameName = String(payload.gameName ?? '').trim() || path.basename(resolvedGamePath);
  const launchMode = payload.launchMode ?? 'default';
  const versions = (Array.isArray(payload.versions) ? payload.versions : []).map((version) => ({
    name: version.name,
    path: path.resolve(String(version.path ?? '').trim()),
    hasNfo: false,
    storageState: version.storageState ?? 'decompressed',
    storageArchivePath: version.storageArchivePath ?? null,
  })).filter((version) => version.path);

  const metadata = await readGameMetadata(resolvedGamePath, gameName, versions);
  const detectedLatestVersion = getLatestVersionName(versions);
  const hasVersionMismatch = Boolean(
    detectedLatestVersion
    && metadata.latestVersion
    && detectedLatestVersion !== metadata.latestVersion,
  );

  const preferredVersionName = (launchMode === 'default'
    ? (metadata.latestVersion || detectedLatestVersion)
    : versions[0]?.name) || versions[0]?.name || '';
  const preferredVersion = versions.find((version) => version.name === preferredVersionName) ?? versions[0];
  if (preferredVersion?.storageState === 'compressed') {
    await appendLogEvent({
      level: 'info',
      source: 'http-service-version-storage',
      message: `Play request requires decompression for "${preferredVersion.path}".`,
    }).catch(() => undefined);
    await decompressVersionFromStorage(resolvedGamePath, preferredVersion.path, preferredVersion.name, 'http-service-version-storage');
    preferredVersion.storageState = 'decompressed';
    preferredVersion.storageArchivePath = null;
  }

  const storedExecutable = metadata.launchExecutable.trim();
  if (storedExecutable && !hasVersionMismatch && launchMode === 'default') {
    const absoluteStoredPath = toExecutableAbsolutePath(resolvedGamePath, storedExecutable);
    if (await fileExists(absoluteStoredPath)) {
      launchExecutable(absoluteStoredPath);
      await appendGameLaunchActivity(resolvedGamePath);
      await appendLogEvent({
        level: 'info',
        source: 'http-service-play-game',
        message: `Launching stored executable "${absoluteStoredPath}" for game "${gameName}"`,
      }).catch(() => undefined);
      return {
        launched: true,
        executablePath: absoluteStoredPath,
        message: `Launching ${path.basename(absoluteStoredPath)}.`,
      };
    }
  }

  const searchFolders = preferredVersion
    ? [preferredVersion.path, ...versions.filter((version) => version.path !== preferredVersion.path).map((version) => version.path)]
    : launchMode === 'choose-version-temporary' && versions.length
      ? [versions[0]?.path ?? resolvedGamePath]
      : versions.length
        ? versions.map((version) => version.path)
        : [resolvedGamePath];
  const discoveredExecutables = [...new Set((await Promise.all(searchFolders.map((folder) => findExecutablesInFolder(folder)))).flat())].sort();

  if (!discoveredExecutables.length) {
    await appendLogEvent({
      level: 'warn',
      source: 'http-service-play-game',
      message: `No executable files found for game "${gameName}"`,
    }).catch(() => undefined);

    return {
      launched: false,
      executablePath: null,
      message: 'No executable files found in game version folders.',
    };
  }

  const selectedExecutable = discoveredExecutables[0];

  if (launchMode === 'default') {
    metadata.launchExecutable = toStoredExecutablePath(resolvedGamePath, selectedExecutable);
    await saveGameMetadata({
      gamePath: resolvedGamePath,
      title: gameName,
      metadata,
    });
  }

  launchExecutable(selectedExecutable);
  await appendGameLaunchActivity(resolvedGamePath);
  await appendLogEvent({
    level: 'info',
    source: 'http-service-play-game',
    message: `Launching selected executable "${selectedExecutable}" for game "${gameName}"`,
  }).catch(() => undefined);

  return {
    launched: true,
    executablePath: selectedExecutable,
    message: `Launching ${path.basename(selectedExecutable)}.`,
  };
}

function applyRuntimeConfigPolicy(config: GalleryConfig) {
  if (!isContainerizedRuntime) {
    return config;
  }

  const currentGamesRoot = String(config.gamesRoot ?? '').trim();
  const currentMetadataMirrorRoot = String(config.metadataMirrorRoot ?? '').trim();
  const shouldUpdateGamesRoot = currentGamesRoot !== containerGamesRoot;
  const shouldUpdateMetadataMirrorRoot = currentMetadataMirrorRoot !== containerMetadataMirrorRoot;

  if (!shouldUpdateGamesRoot && !shouldUpdateMetadataMirrorRoot) {
    return config;
  }

  return {
    ...config,
    gamesRoot: containerGamesRoot,
    metadataMirrorRoot: containerMetadataMirrorRoot,
  };
}

async function loadRuntimeConfig() {
  const config = await loadConfig();
  const runtimeScopedConfig = applyRuntimeConfigPolicy(config);

  if (
    runtimeScopedConfig.gamesRoot === config.gamesRoot
    && runtimeScopedConfig.metadataMirrorRoot === config.metadataMirrorRoot
  ) {
    return config;
  }

  return saveConfig(runtimeScopedConfig);
}

export async function startGalleryHttpService({
  appVersion,
  startedAt,
  host,
  port,
}: StartGalleryHttpServiceArgs): Promise<GalleryHttpService> {
  const resolvedHost = normalizeHost(host);
  const resolvedPort = normalizePort(port);

  const resolveRequestCapabilities = (request: IncomingMessage): ServiceCapabilities => {
    const supportsLaunch = !isContainerizedRuntime && isRequestFromSameMachine(request);
    const supportsHostFolderPicker = supportsLaunch && Boolean(process.versions.electron);

    return {
      supportsLaunch,
      supportsHostFolderPicker,
      launchPolicy: 'host-desktop-only',
      supportsNativeContextMenu: false,
      supportsTrayLifecycle: true,
      clientMode: 'web',
      isContainerized: isContainerizedRuntime,
      isGamesRootEditable: !isContainerizedRuntime,
    };
  };
  const localHostCapabilities: ServiceCapabilities = {
    supportsLaunch: !isContainerizedRuntime,
    supportsHostFolderPicker: !isContainerizedRuntime && Boolean(process.versions.electron),
    launchPolicy: 'host-desktop-only',
    supportsNativeContextMenu: false,
    supportsTrayLifecycle: true,
    clientMode: 'web',
    isContainerized: isContainerizedRuntime,
    isGamesRootEditable: !isContainerizedRuntime,
  };

  const apiVersion: ServiceApiVersionInfo = {
    apiVersion: 'http-v1',
    serviceName: 'local-game-gallery-service',
    serviceBuild: appVersion,
  };

  let health: ServiceHealthStatus = {
    status: 'starting',
    startedAt,
    host: resolvedHost,
    port: resolvedPort,
    transport: 'http',
  };

  const server = createServer((request, response) => {
    void (async () => {
      const method = String(request.method ?? 'GET').toUpperCase();
      const requestUrl = parseRequestUrl(request, health.host, health.port);
      const route = requestUrl.pathname;

      if (method === 'OPTIONS') {
        sendNoContent(response);
        return;
      }

      if (method === 'GET' && route === '/api/health') {
        sendOk(response, health);
        return;
      }

      if (method === 'GET' && route === '/api/version') {
        sendOk(response, apiVersion);
        return;
      }

      if (method === 'GET' && route === '/api/capabilities') {
        sendOk(response, resolveRequestCapabilities(request));
        return;
      }

      if (method === 'POST' && route === '/api/open-folder') {
        const capabilities = resolveRequestCapabilities(request);
        if (!capabilities.supportsLaunch) {
          sendError(response, 403, 'forbidden_host_action', 'Opening folders is allowed only for same-machine clients.');
          return;
        }

        try {
          const payload = await readJsonBody<OpenFolderPayload>(request);
          const result = await openFolderInSystemShell(payload.folderPath);
          sendOk(response, result);
        } catch (error) {
          sendError(response, 400, 'open_folder_failed', toErrorMessage(error, 'Failed to open folder.'));
        }
        return;
      }

      if (method === 'POST' && route === '/api/open-log-folder') {
        const capabilities = resolveRequestCapabilities(request);
        if (!capabilities.supportsLaunch) {
          sendError(response, 403, 'forbidden_host_action', 'Opening folders is allowed only for same-machine clients.');
          return;
        }

        try {
          const result = await openLogFolder();
          sendOk(response, result);
        } catch (error) {
          sendError(response, 400, 'open_log_folder_failed', toErrorMessage(error, 'Failed to open logs folder.'));
        }
        return;
      }

      if (method === 'POST' && route === '/api/archive-upload/stage') {
        const capabilities = resolveRequestCapabilities(request);
        if (!capabilities.supportsLaunch) {
          sendError(response, 403, 'forbidden_host_action', 'Archive upload is allowed only for same-machine clients.');
          return;
        }

        try {
          const payload = await readJsonBody<StageArchiveUploadPayload>(request);
          const requestedFileName = String(payload.fileName ?? '').trim();
          const filePath = String(payload.filePath ?? '').trim();
          const sourceFileName = requestedFileName || (filePath ? path.basename(filePath) : '');
          if (!sourceFileName) {
            sendError(response, 400, 'invalid_archive_payload', 'Archive file name is required.');
            return;
          }

          const uploadId = randomUUID();
          const extension = path.extname(sourceFileName).toLowerCase() || '.zip';
          const stagedFilePath = path.join(os.tmpdir(), `lgg-archive-upload-${uploadId}${extension}`);
          let sizeBytes = 0;
          let transport = 'base64';

          if (filePath) {
            const sourceStats = await stat(filePath);
            if (!sourceStats.isFile()) {
              sendError(response, 400, 'invalid_archive_payload', 'Selected archive path is not a file.');
              return;
            }

            sizeBytes = sourceStats.size;
            if (!sizeBytes) {
              sendError(response, 400, 'invalid_archive_payload', 'Uploaded archive is empty or invalid.');
              return;
            }

            await copyFile(filePath, stagedFilePath);
            transport = 'path';
          } else {
            const dataBase64 = String(payload.dataBase64 ?? '').trim();
            if (!dataBase64) {
              sendError(response, 400, 'invalid_archive_payload', 'Archive content is required.');
              return;
            }

            const contents = Buffer.from(dataBase64, 'base64');
            if (!contents.length) {
              sendError(response, 400, 'invalid_archive_payload', 'Uploaded archive is empty or invalid.');
              return;
            }

            sizeBytes = contents.length;
            await writeFile(stagedFilePath, contents);
          }

          stagedArchiveUploads.set(uploadId, {
            filePath: stagedFilePath,
            originalFileName: sourceFileName,
          });

          await appendLogEvent({
            level: 'info',
            source: 'service-game-upload',
            message: `Staged archive upload "${sourceFileName}" as ${uploadId} (${sizeBytes} bytes, transport=${transport}).`,
          }).catch(() => undefined);

          sendOk(response, {
            uploadId,
            originalFileName: sourceFileName,
            sizeBytes,
          });
        } catch (error) {
          await appendLogEvent({
            level: 'error',
            source: 'service-game-upload',
            message: `Failed to stage archive upload: ${toErrorMessage(error, 'Unknown stage error.')}`,
          }).catch(() => undefined);
          sendError(response, 400, 'archive_stage_failed', toErrorMessage(error, 'Failed to stage archive upload.'));
        }

        return;
      }

      if (method === 'DELETE' && route === '/api/archive-upload/stage') {
        try {
          const payload = await readJsonBody<CancelArchiveUploadPayload>(request);
          const uploadId = String(payload.uploadId ?? '').trim();
          if (!uploadId) {
            await appendLogEvent({
              level: 'warn',
              source: 'service-game-upload',
              message: 'Cancel staged archive requested without an uploadId.',
            }).catch(() => undefined);
            sendOk(response, { cancelled: false });
            return;
          }

          await removeStagedArchiveUpload(uploadId);
          await appendLogEvent({
            level: 'info',
            source: 'service-game-upload',
            message: `Cancelled staged archive upload ${uploadId}.`,
          }).catch(() => undefined);
          sendOk(response, { cancelled: true });
        } catch (error) {
          await appendLogEvent({
            level: 'error',
            source: 'service-game-upload',
            message: `Failed to cancel staged archive upload: ${toErrorMessage(error, 'Unknown cancel error.')}`,
          }).catch(() => undefined);
          sendError(response, 400, 'archive_cancel_failed', toErrorMessage(error, 'Failed to cancel staged archive upload.'));
        }

        return;
      }

      if (method === 'POST' && route === '/api/archive-upload/import') {
        const capabilities = resolveRequestCapabilities(request);
        if (!capabilities.supportsLaunch) {
          sendError(response, 403, 'forbidden_host_action', 'Archive import is allowed only for same-machine clients.');
          return;
        }

        try {
          const payload = await readJsonBody<ImportArchiveUploadPayload>(request);
          const uploadId = String(payload.uploadId ?? '').trim();
          const gameName = String(payload.gameName ?? '').trim();
          const versionName = String(payload.versionName ?? '').trim();

          if (!uploadId || !gameName || !versionName) {
            sendError(response, 400, 'invalid_archive_import_payload', 'Game name, version, and staged archive are required.');
            return;
          }

          const staged = stagedArchiveUploads.get(uploadId);
          if (!staged) {
            sendError(response, 404, 'staged_archive_not_found', 'Staged archive not found. Re-select file and try again.');
            return;
          }

          const config = await loadRuntimeConfig();
          const gamesRoot = String(config.gamesRoot ?? '').trim();
          if (!gamesRoot) {
            sendError(response, 400, 'missing_games_root', 'Games root is not configured on host.');
            return;
          }

          const resolvedGamesRoot = path.resolve(gamesRoot);
          const existingGamePath = String(payload.existingGamePath ?? '').trim();
          const fallbackGamePath = path.join(resolvedGamesRoot, toSafeFolderName(gameName, 'Imported Game'));
          const targetGamePath = existingGamePath ? path.resolve(existingGamePath) : fallbackGamePath;
          if (!isPathInside(resolvedGamesRoot, targetGamePath)) {
            sendError(response, 403, 'forbidden_game_path', 'Target game path is outside allowed gallery roots.');
            return;
          }

          const targetVersionPath = path.join(targetGamePath, toSafeFolderName(versionName, 'Version'));
          const extractRoot = await mkdtemp(path.join(os.tmpdir(), `lgg-archive-extract-${uploadId}-`));

          try {
            await appendLogEvent({
              level: 'info',
              source: 'service-game-upload',
              message: `Importing staged archive ${uploadId} into "${targetVersionPath}".`,
            }).catch(() => undefined);

            await mkdir(targetVersionPath, { recursive: true });
            await extractZipToFolder(staged.filePath, extractRoot);
            await copyExtractedArchiveIntoVersion(extractRoot, targetVersionPath);

            const mergedMetadata = {
              ...toDefaultImportMetadata(versionName),
              ...(payload.metadata ?? {}),
              latestVersion: String(payload.metadata?.latestVersion ?? versionName).trim() || versionName,
            };

            await saveGameMetadata({
              gamePath: targetGamePath,
              title: gameName,
              metadata: mergedMetadata,
            });

            const result: ImportStagedGameArchiveResult = {
              imported: true,
              gamePath: targetGamePath,
              versionPath: targetVersionPath,
              message: `Imported ${gameName} (${versionName}).`,
            };

            await appendLogEvent({
              level: 'info',
              source: 'service-game-upload',
              message: `Imported staged archive ${uploadId} into "${targetVersionPath}".`,
            }).catch(() => undefined);

            sendOk(response, result);
          } catch (error) {
            await appendLogEvent({
              level: 'error',
              source: 'service-game-upload',
              message: `Failed to import staged archive ${uploadId}: ${toErrorMessage(error, 'Unknown import error.')}`,
            }).catch(() => undefined);
            throw error;
          } finally {
            await rm(extractRoot, { recursive: true, force: true }).catch(() => undefined);
            await removeStagedArchiveUpload(uploadId);
          }
        } catch (error) {
          sendError(response, 400, 'archive_import_failed', toErrorMessage(error, 'Failed to import staged archive.'));
        }

        return;
      }

      if (method === 'POST' && route === '/api/play-game') {
        const capabilities = resolveRequestCapabilities(request);
        if (!capabilities.supportsLaunch) {
          sendError(response, 403, 'forbidden_host_action', 'Launching games is allowed only for same-machine clients.');
          return;
        }

        try {
          const payload = await readJsonBody<PlayGamePayload>(request);
          const result = await launchGameFromService(payload);
          sendOk(response, result);
        } catch (error) {
          sendError(response, 400, 'play_game_failed', toErrorMessage(error, 'Failed to launch game.'));
        }
        return;
      }

      if (method === 'POST' && route === '/api/pick-games-root') {
        const capabilities = resolveRequestCapabilities(request);
        if (!capabilities.supportsLaunch) {
          sendError(response, 403, 'forbidden_host_action', 'Picking folders is allowed only for same-machine clients.');
          return;
        }

        try {
          const selectedPath = await pickFolderFromHostDialog('Choose your main games folder');
          sendOk(response, { selectedPath });
        } catch (error) {
          sendError(response, 400, 'pick_games_root_failed', toErrorMessage(error, 'Failed to pick games root folder.'));
        }
        return;
      }

      if (method === 'POST' && route === '/api/pick-metadata-mirror-root') {
        const capabilities = resolveRequestCapabilities(request);
        if (!capabilities.supportsLaunch) {
          sendError(response, 403, 'forbidden_host_action', 'Picking folders is allowed only for same-machine clients.');
          return;
        }

        try {
          const selectedPath = await pickFolderFromHostDialog('Choose metadata mirror folder');
          sendOk(response, { selectedPath });
        } catch (error) {
          sendError(response, 400, 'pick_metadata_mirror_root_failed', toErrorMessage(error, 'Failed to pick metadata mirror folder.'));
        }
        return;
      }

      if (method === 'POST' && route === '/api/pick-archive-upload-file') {
        const capabilities = resolveRequestCapabilities(request);
        if (!capabilities.supportsLaunch) {
          sendError(response, 403, 'forbidden_host_action', 'Picking archive files is allowed only for same-machine clients.');
          return;
        }

        try {
          const selectedFile = await pickArchiveUploadFileFromHostDialog();
          sendOk(response, { selectedFile });
        } catch (error) {
          sendError(response, 400, 'pick_archive_upload_file_failed', toErrorMessage(error, 'Failed to pick archive upload file.'));
        }
        return;
      }

      if (method === 'GET' && route === '/api/media-file') {
        const mediaPath = String(requestUrl.searchParams.get('path') ?? '').trim();
        if (!mediaPath) {
          sendError(response, 400, 'missing_media_path', 'Query parameter "path" is required.');
          return;
        }

        const resolvedMediaPath = path.resolve(mediaPath);
        const contentType = resolveImageContentType(resolvedMediaPath);
        if (!contentType) {
          sendError(response, 415, 'unsupported_media_type', 'Only image files are supported for media rendering.');
          return;
        }

        const config = await loadRuntimeConfig();
        if (!isAllowedMediaPath(resolvedMediaPath, config)) {
          sendError(response, 403, 'forbidden_media_path', 'Requested media path is outside allowed gallery roots.');
          return;
        }

        try {
          const fileStats = await stat(resolvedMediaPath);
          if (!fileStats.isFile()) {
            sendError(response, 404, 'media_not_found', 'Media file not found.');
            return;
          }

          const fileContents = await readFile(resolvedMediaPath);
          withCorsHeaders(response);
          response.statusCode = 200;
          response.setHeader('Content-Type', contentType);
          response.setHeader('Cache-Control', 'no-store');
          response.end(fileContents);
        } catch {
          sendError(response, 404, 'media_not_found', 'Media file not found.');
        }

        return;
      }

      if (method === 'GET' && route === '/api/extras/download') {
        const gamePath = String(requestUrl.searchParams.get('gamePath') ?? '').trim();
        const relativePath = String(requestUrl.searchParams.get('relativePath') ?? '').trim();
        if (!gamePath || !relativePath) {
          sendError(response, 400, 'missing_extra_path', 'Query params gamePath and relativePath are required.');
          return;
        }

        const config = await loadRuntimeConfig();
        const resolvedGamePath = path.resolve(gamePath);
        if (!isPathInsideAllowedGalleryRoots(resolvedGamePath, config)) {
          sendError(response, 403, 'forbidden_game_path', 'Target game path is outside allowed gallery roots.');
          return;
        }

        const extrasRoot = path.resolve(resolvedGamePath, 'extras');
        const extrasRootStats = await stat(extrasRoot).catch(() => null);
        if (!extrasRootStats?.isDirectory()) {
          sendError(response, 404, 'extras_not_found', 'Extras folder was not found for this game.');
          return;
        }

        const resolvedTargetPath = path.resolve(extrasRoot, relativePath);
        if (!isPathInside(extrasRoot, resolvedTargetPath)) {
          sendError(response, 403, 'forbidden_extra_path', 'Requested extras path is outside the extras folder.');
          return;
        }

        const targetStats = await stat(resolvedTargetPath).catch(() => null);
        if (!targetStats) {
          sendError(response, 404, 'extra_not_found', 'Requested extras item was not found.');
          return;
        }

        if (targetStats.isFile()) {
          const fileName = toDownloadSafeFileName(path.basename(resolvedTargetPath));
          const fileContents = await readFile(resolvedTargetPath);
          withCorsHeaders(response);
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/octet-stream');
          response.setHeader('Content-Disposition', buildAttachmentContentDisposition(fileName));
          response.setHeader('Cache-Control', 'no-store');
          response.end(fileContents);
          return;
        }

        if (targetStats.isDirectory()) {
          const tempDir = await mkdtemp(path.join(os.tmpdir(), 'lgg-extra-zip-'));
          const zipFileName = `${toDownloadSafeFileName(path.basename(resolvedTargetPath))}.zip`;
          const zipPath = path.join(tempDir, zipFileName);

          try {
            await createZipFromFolder(resolvedTargetPath, zipPath);
            const zipContents = await readFile(zipPath);

            withCorsHeaders(response);
            response.statusCode = 200;
            response.setHeader('Content-Type', 'application/zip');
            response.setHeader('Content-Disposition', buildAttachmentContentDisposition(zipFileName));
            response.setHeader('Cache-Control', 'no-store');
            response.end(zipContents);
          } catch (error) {
            const message = toErrorMessage(error, 'Failed to package folder for download.');
            await appendLogEvent({
              level: 'error',
              source: 'http-service-extras-download',
              message: `Folder extras download failed for "${resolvedTargetPath}": ${message}`,
            }).catch(() => undefined);
            sendError(response, 500, 'extras_folder_download_failed', message);
          } finally {
            await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
          }

          return;
        }

        sendError(response, 400, 'unsupported_extra_item', 'Requested extras item must be a file or folder.');
        return;
      }

      if (method === 'GET' && route === '/api/versions/download') {
        const gamePath = String(requestUrl.searchParams.get('gamePath') ?? '').trim();
        const versionPath = String(requestUrl.searchParams.get('versionPath') ?? '').trim();
        const versionName = String(requestUrl.searchParams.get('versionName') ?? '').trim();
        if (!gamePath || !versionPath) {
          sendError(response, 400, 'missing_version_path', 'Query params gamePath and versionPath are required.');
          return;
        }

        const config = await loadRuntimeConfig();
        const resolvedGamePath = path.resolve(gamePath);
        if (!isPathInsideAllowedGalleryRoots(resolvedGamePath, config)) {
          sendError(response, 403, 'forbidden_game_path', 'Target game path is outside allowed gallery roots.');
          return;
        }

        const resolvedVersionPath = path.resolve(versionPath);
        if (!isPathInside(resolvedGamePath, resolvedVersionPath)) {
          sendError(response, 403, 'forbidden_version_path', 'Requested version path is outside the game folder.');
          return;
        }

        const targetStats = await stat(resolvedVersionPath).catch(() => null);
        if (!targetStats?.isDirectory()) {
          sendError(response, 404, 'version_not_found', 'Requested version folder was not found.');
          return;
        }

        const storedArchive = await resolveVersionStorageArchive(resolvedVersionPath);
        const baseName = toDownloadSafeFileName(versionName || path.basename(resolvedVersionPath));

        try {
          if (storedArchive) {
            const archiveContents = await readFile(storedArchive.archivePath);
            const archiveFileName = `${baseName}.${storedArchive.extension}`;
            withCorsHeaders(response);
            response.statusCode = 200;
            response.setHeader('Content-Type', storedArchive.extension === 'zip' ? 'application/zip' : 'application/octet-stream');
            response.setHeader('Content-Disposition', buildAttachmentContentDisposition(archiveFileName));
            response.setHeader('Cache-Control', 'no-store');
            response.end(archiveContents);
            await appendLogEvent({
              level: 'info',
              source: 'http-service-versions-download',
              message: `Version download reused stored archive "${storedArchive.archivePath}" for "${resolvedVersionPath}".`,
            }).catch(() => undefined);
            return;
          }

          const tempDir = await mkdtemp(path.join(os.tmpdir(), 'lgg-version-zip-'));
          const zipFileName = `${baseName}.zip`;
          const zipPath = path.join(tempDir, zipFileName);
          try {
            await appendLogEvent({
              level: 'info',
              source: 'http-service-versions-download',
              message: `Version download requires on-demand compression for "${resolvedVersionPath}".`,
            }).catch(() => undefined);
            await createZipFromFolder(resolvedVersionPath, zipPath);
            const zipContents = await readFile(zipPath);

            withCorsHeaders(response);
            response.statusCode = 200;
            response.setHeader('Content-Type', 'application/zip');
            response.setHeader('Content-Disposition', buildAttachmentContentDisposition(zipFileName));
            response.setHeader('Cache-Control', 'no-store');
            response.end(zipContents);
          } finally {
            await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
          }
        } catch (error) {
          const message = toErrorMessage(error, 'Failed to package version for download.');
          await appendLogEvent({
            level: 'error',
            source: 'http-service-versions-download',
            message: `Version download failed for "${resolvedVersionPath}": ${message}`,
          }).catch(() => undefined);
          sendError(response, 500, 'version_download_failed', message);
        }

        return;
      }

      if (method === 'GET' && route === '/api/config') {
        const config = await loadRuntimeConfig();
        sendOk(response, config);
        return;
      }

      if (method === 'PUT' && route === '/api/config') {
        try {
          const payload = await readJsonBody<Partial<GalleryConfig>>(request);
          const currentConfig = await loadRuntimeConfig();
          const nextConfig = applyRuntimeConfigPolicy({
            ...currentConfig,
            ...payload,
          } as GalleryConfig);
          const saved = await saveConfig(nextConfig);
          sendOk(response, saved);
        } catch (error) {
          sendError(response, 400, 'invalid_config_payload', toErrorMessage(error, 'Invalid config payload.'));
        }
        return;
      }

      if (method === 'POST' && route === '/api/scan') {
        try {
          let scanRequest: ScanRequestOptions = {};
          const contentLengthHeader = request.headers['content-length'];
          const contentLength = Number.parseInt(String(contentLengthHeader ?? ''), 10);
          const hasRequestBody = (Number.isFinite(contentLength) && contentLength > 0)
            || Boolean(request.headers['transfer-encoding']);

          if (hasRequestBody) {
            scanRequest = await readJsonBody<ScanRequestOptions>(request);
          }

          const config = await loadRuntimeConfig();
          const scanResult: ScanResult = await scanGames(config, scanRequest);
          sendOk(response, scanResult);
        } catch (error) {
          const message = toErrorMessage(error, 'Scan failed.');
          await appendLogEvent({
            level: 'error',
            source: 'scan-sync',
            message: `HTTP scan request failed: ${message}`,
          }).catch(() => undefined);
          sendError(response, 400, 'scan_failed', message);
        }
        return;
      }

      if (method === 'POST' && route === '/api/version-storage/compress') {
        try {
          const payload = await readJsonBody<CompressGameVersionPayload>(request);
          const gamePath = String(payload.gamePath ?? '').trim();
          const versionPath = String(payload.versionPath ?? '').trim();
          const versionName = String(payload.versionName ?? '').trim() || path.basename(versionPath || gamePath || 'Version');
          if (!gamePath || !versionPath) {
            sendError(response, 400, 'invalid_version_storage_payload', 'Game path and version path are required for compression.');
            return;
          }

          const result = await compressVersionForStorage(gamePath, versionPath, versionName, 'http-service-version-storage');
          sendOk(response, result);
        } catch (error) {
          sendError(response, 400, 'compress_version_failed', toErrorMessage(error, 'Failed to compress version.'));
        }
        return;
      }

      if (method === 'POST' && route === '/api/version-storage/decompress') {
        try {
          const payload = await readJsonBody<DecompressGameVersionPayload>(request);
          const gamePath = String(payload.gamePath ?? '').trim();
          const versionPath = String(payload.versionPath ?? '').trim();
          const versionName = String(payload.versionName ?? '').trim() || path.basename(versionPath || gamePath || 'Version');
          if (!gamePath || !versionPath) {
            sendError(response, 400, 'invalid_version_storage_payload', 'Game path and version path are required for decompression.');
            return;
          }

          const result = await decompressVersionFromStorage(gamePath, versionPath, versionName, 'http-service-version-storage');
          sendOk(response, result);
        } catch (error) {
          sendError(response, 400, 'decompress_version_failed', toErrorMessage(error, 'Failed to decompress version.'));
        }
        return;
      }

      if (method === 'POST' && route === '/api/scan-game') {
        try {
          const payload = await readJsonBody<{ gamePath: string }>(request);
          const config = await loadRuntimeConfig();
          const resolvedGamePath = path.resolve(String(payload.gamePath ?? '').trim());
          if (!resolvedGamePath) {
            sendError(response, 400, 'invalid_game_path', 'Game path is required.');
            return;
          }
          if (!isPathInsideAllowedGalleryRoots(resolvedGamePath, config)) {
            sendError(response, 403, 'forbidden_game_path', 'Target game path is outside allowed gallery roots.');
            return;
          }

          const game = await scanGame(config, resolvedGamePath);
          sendOk(response, { game });
        } catch (error) {
          sendError(response, 400, 'scan_game_failed', toErrorMessage(error, 'Failed to refresh game.'));
        }
        return;
      }

      if (method === 'POST' && route === '/api/log-event') {
        try {
          const payload = await readJsonBody<LogEventPayload>(request);
          await appendLogEvent(payload);
          sendOk(response, { recorded: true });
        } catch (error) {
          sendError(response, 400, 'log_event_failed', toErrorMessage(error, 'Failed to record log event.'));
        }
        return;
      }

      if (method === 'GET' && route === '/api/logs') {
        const contents = await readLogContents();
        sendOk(response, { contents });
        return;
      }

      if (method === 'DELETE' && route === '/api/logs') {
        await clearLogContents();
        sendOk(response, { cleared: true });
        return;
      }

      if (method === 'POST' && route === '/api/metadata') {
        try {
          const payload = await readJsonBody<SaveGameMetadataPayload>(request);
          await saveGameMetadata(payload);
          sendOk(response, { saved: true });
        } catch (error) {
          sendError(response, 400, 'metadata_save_failed', toErrorMessage(error, 'Failed to save metadata.'));
        }
        return;
      }

      if (method === 'POST' && route === '/api/media/reorder') {
        try {
          const payload = await readJsonBody<ReorderScreenshotsPayload>(request);
          await reorderScreenshots(payload.fromPath, payload.toPath);
          sendOk(response, { reordered: true });
        } catch (error) {
          sendError(response, 400, 'screenshot_reorder_failed', toErrorMessage(error, 'Failed to reorder screenshots.'));
        }
        return;
      }

      if (method === 'POST' && route === '/api/media/remove-screenshot') {
        try {
          const payload = await readJsonBody<RemoveScreenshotPayload>(request);
          await removeScreenshot(payload.screenshotPath);
          sendOk(response, { removed: true });
        } catch (error) {
          sendError(response, 400, 'screenshot_remove_failed', toErrorMessage(error, 'Failed to remove screenshot.'));
        }
        return;
      }

      if (method === 'POST' && route === '/api/media/upload') {
        try {
          const payload = await readJsonBody<UploadGameMediaPayload>(request);
          const config = await loadRuntimeConfig();
          const allowedRoots = resolveAllowedGalleryRoots(config);
          if (!allowedRoots.length) {
            sendError(response, 400, 'missing_games_root', 'Games root is not configured on host.');
            return;
          }

          const resolvedGamePath = path.resolve(String(payload.gamePath ?? '').trim());

          if (!isPathInsideAllowedGalleryRoots(resolvedGamePath, config)) {
            sendError(response, 403, 'forbidden_game_path', 'Target game path is outside allowed gallery roots.');
            return;
          }

          const target = String(payload.target ?? '').trim().toLowerCase();
          if (!['poster', 'card', 'background', 'screenshot'].includes(target)) {
            sendError(response, 400, 'invalid_media_target', 'Media target must be poster, card, background, or screenshot.');
            return;
          }

          const files = Array.isArray(payload.files) ? payload.files : [];
          if (!files.length) {
            sendError(response, 400, 'missing_media_files', 'At least one media file is required.');
            return;
          }

          const picturesPath = path.join(resolvedGamePath, config.picturesFolderName);
          await mkdir(picturesPath, { recursive: true });

          const pictureEntries = await readdir(picturesPath, { withFileTypes: true }).catch(() => []);
          const existingFileNames = pictureEntries.filter((entry) => entry.isFile()).map((entry) => entry.name);
          let importedCount = 0;

          if (target === 'screenshot') {
            let screenshotIndex = nextScreenshotIndex(existingFileNames);

            for (const filePayload of files) {
              const extension = resolveUploadExtension(String(filePayload.name ?? ''), filePayload.mimeType);
              if (!extension) {
                continue;
              }

              const contents = decodeBase64File(filePayload);
              const destination = path.join(picturesPath, `Screen${screenshotIndex}${extension}`);
              await writeFile(destination, contents);
              screenshotIndex += 1;
              importedCount += 1;
            }
          } else {
            for (const existingName of existingFileNames) {
              const parsed = path.parse(existingName);
              if (parsed.name.toLowerCase() !== target) {
                continue;
              }

              await unlink(path.join(picturesPath, existingName)).catch(() => undefined);
            }

            const firstSupported = files.find((filePayload) => resolveUploadExtension(String(filePayload.name ?? ''), filePayload.mimeType));
            if (firstSupported) {
              const extension = resolveUploadExtension(String(firstSupported.name ?? ''), firstSupported.mimeType);
              if (extension) {
                const contents = decodeBase64File(firstSupported);
                await writeFile(path.join(picturesPath, `${target}${extension}`), contents);
                importedCount = 1;
              }
            }
          }

          sendOk(response, {
            importedCount,
          });
        } catch (error) {
          sendError(response, 400, 'media_upload_failed', toErrorMessage(error, 'Failed to upload media files.'));
        }
        return;
      }

      sendError(response, 404, 'not_found', 'Route not found.');
    })().catch((error) => {
      sendError(response, 500, 'internal_error', toErrorMessage(error, 'Unexpected server error.'));
    });
  });

  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error) => {
      server.off('listening', handleListening);
      reject(error);
    };

    const handleListening = () => {
      server.off('error', handleError);
      resolve();
    };

    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(resolvedPort, resolvedHost);
  });

  const address = server.address() as AddressInfo | null;
  health = {
    status: 'ok',
    startedAt,
    host: address?.address || resolvedHost,
    port: address?.port || resolvedPort,
    transport: 'http',
  };

  await appendLogEvent({
    level: 'info',
    source: 'http-service',
    message: `HTTP service listening on http://${health.host}:${health.port}`,
  }).catch(() => undefined);

  const stop = async () => {
    if (!server.listening) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    health = {
      ...health,
      status: 'degraded',
    };
  };

  return {
    stop,
    getHealth: () => health,
    getCapabilities: () => localHostCapabilities,
    getApiVersion: () => apiVersion,
    getBaseUrl: () => `http://${health.host}:${health.port}`,
  };
}
