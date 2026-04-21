/**
 * HTTP service host for browser/mobile gallery access over LAN/Tailscale.
 *
 * New to this project: this module exposes transport-safe endpoints that mirror
 * core desktop IPC operations so non-Electron clients can use shared contracts.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { spawn } from 'node:child_process';
import { copyFile, cp, mkdtemp, mkdir, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
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
  type ScanGameSizesPayload,
  type ScanGameSizesResult,
  type SaveGameMetadataPayload,
  type CompressGameVersionPayload,
  type CompressGameVersionResult,
  type DecompressGameVersionPayload,
  type DecompressGameVersionResult,
  type ScanResult,
  type ServiceApiVersionInfo,
  type ServiceCapabilities,
  type ServiceHealthStatus,
  type VersionStorageProgressEvent,
} from '../src/types';
import { loadConfig, saveConfig } from './config';
import { getLatestVersionName, readGameMetadata, reorderScreenshots, removeScreenshot, saveGameMetadata } from './game-library';
import { appendLogEvent, clearLogContents, openLogFolder, readLogContents } from './logger';
import { scanGame, scanGameSizes, scanGames } from './scanner';
import { handleArchiveUploadRoutes } from './http/handleArchiveUploadRoutes';
import {
  buildAttachmentContentDisposition,
  compressVersionForStorage,
  createZipFromFolder,
  decompressVersionFromStorage,
  isPathInside,
  resolveVersionStorageArchive,
  toDownloadSafeFileName,
} from './shared/archive-version-storage';
import {
  appendGameLaunchActivity,
  findExecutablesInFolder,
  launchExecutable,
  toExecutableAbsolutePath,
  toStoredExecutablePath,
} from './shared/game-launch-utils';
import { removeStagedArchiveUpload } from './shared/staged-archive-upload';

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
  ['.avif', 'image/avif'],
]);
const mediaVariantDirectoryByVariant = {
  smallThumbnail: 'smallThumbnail',
  mediumPreview: 'mediumPreview',
} as const;
const mediaVariantSpecByVariant = {
  smallThumbnail: {
    maxWidth: 360,
    maxHeight: 360,
    quality: 72,
  },
  mediumPreview: {
    maxWidth: 1280,
    maxHeight: 1280,
    quality: 80,
  },
} as const;
const mediaVariantDirectoryNames = new Set<string>(Object.values(mediaVariantDirectoryByVariant));

type MediaImageVariant = keyof typeof mediaVariantDirectoryByVariant | 'original';
type SupportedMediaVariant = keyof typeof mediaVariantSpecByVariant;
const imageMimeToExtension = new Map<string, string>([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/bmp', '.bmp'],
  ['image/avif', '.avif'],
]);
const stagedArchiveUploads = new Map<string, { filePath: string; originalFileName: string }>();
const versionStorageProgressRetentionMs = 10 * 60 * 1000;
const versionStorageProgressByOperationId = new Map<
  string,
  {
    event: VersionStorageProgressEvent;
    completed: boolean;
    updatedAt: number;
  }
>();
const mediaMutationQueueByPicturesPath = new Map<string, Promise<void>>();

async function runMediaMutationLocked<T>(picturesPath: string, operation: () => Promise<T>): Promise<T> {
  const normalizedPath = path.resolve(picturesPath);
  const pending = mediaMutationQueueByPicturesPath.get(normalizedPath) ?? Promise.resolve();

  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const enqueued = pending.then(() => gate);
  mediaMutationQueueByPicturesPath.set(normalizedPath, enqueued);

  try {
    await pending;
    return await operation();
  } finally {
    release();

    const current = mediaMutationQueueByPicturesPath.get(normalizedPath);
    if (current === enqueued) {
      mediaMutationQueueByPicturesPath.delete(normalizedPath);
    }
  }
}

function setVersionStorageProgress(event: VersionStorageProgressEvent, completed = false) {
  versionStorageProgressByOperationId.set(event.operationId, {
    event: {
      ...event,
      percent: Math.max(0, Math.min(1, Number(event.percent ?? 0))),
    },
    completed,
    updatedAt: Date.now(),
  });

  if (!completed) {
    return;
  }

  const cleanupTimer = setTimeout(() => {
    versionStorageProgressByOperationId.delete(event.operationId);
  }, versionStorageProgressRetentionMs);
  cleanupTimer.unref?.();
}

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

function resolveImageContentType(filePath: string) {
  return imageContentTypes.get(path.extname(filePath).toLowerCase()) ?? null;
}

function normalizeMediaImageVariant(rawVariant: string | null | undefined): MediaImageVariant {
  const normalized = String(rawVariant ?? '').trim();
  if (!normalized || normalized === 'original') {
    return 'original';
  }

  if (normalized === 'smallThumbnail' || normalized === 'thumb') {
    return 'smallThumbnail';
  }

  if (normalized === 'mediumPreview' || normalized === 'preview') {
    return 'mediumPreview';
  }

  return 'original';
}

function resolvePicturesRootForMediaPath(mediaPath: string, picturesFolderName: string) {
  const normalizedPicturesFolderName = String(picturesFolderName ?? '').trim();
  if (!normalizedPicturesFolderName) {
    return null;
  }

  const mediaFolderPath = path.dirname(mediaPath);
  const mediaFolderName = path.basename(mediaFolderPath);
  if (mediaFolderName === normalizedPicturesFolderName) {
    return mediaFolderPath;
  }

  if (!mediaVariantDirectoryNames.has(mediaFolderName)) {
    return null;
  }

  const parentFolderPath = path.dirname(mediaFolderPath);
  if (path.basename(parentFolderPath) !== normalizedPicturesFolderName) {
    return null;
  }

  return parentFolderPath;
}

function resolveMediaVariantPath(mediaPath: string, variant: MediaImageVariant, picturesFolderName: string) {
  if (variant === 'original') {
    return mediaPath;
  }

  const variantDirectoryName = mediaVariantDirectoryByVariant[variant];
  const picturesRootPath = resolvePicturesRootForMediaPath(mediaPath, picturesFolderName);
  if (!picturesRootPath) {
    return null;
  }

  return path.join(picturesRootPath, variantDirectoryName, path.basename(mediaPath));
}

function toSupportedMediaVariant(variant: MediaImageVariant): SupportedMediaVariant | null {
  if (variant === 'smallThumbnail' || variant === 'mediumPreview') {
    return variant;
  }

  return null;
}

function isSupportedImagePath(filePath: string) {
  return resolveImageContentType(filePath) !== null;
}

async function ensureMediaVariantGenerated(
  sourcePath: string,
  targetPath: string,
  variant: SupportedMediaVariant,
): Promise<boolean> {
  const sourceStats = await stat(sourcePath).catch(() => null);
  if (!sourceStats?.isFile()) {
    return false;
  }

  const targetStats = await stat(targetPath).catch(() => null);
  if (targetStats?.isFile() && targetStats.mtimeMs >= sourceStats.mtimeMs) {
    return true;
  }

  const targetDir = path.dirname(targetPath);
  await mkdir(targetDir, { recursive: true });

  const variantSpec = mediaVariantSpecByVariant[variant];
  const ext = path.extname(sourcePath).toLowerCase();

  if (ext === '.gif') {
    try {
      await copyFile(sourcePath, targetPath);
      return true;
    } catch {
      return false;
    }
  }

  try {
    let pipeline = sharp(sourcePath, { failOn: 'none' })
      .rotate()
      .resize({
        width: variantSpec.maxWidth,
        height: variantSpec.maxHeight,
        fit: 'inside',
        withoutEnlargement: true,
      });

    if (ext === '.jpg' || ext === '.jpeg') {
      pipeline = pipeline.jpeg({ quality: variantSpec.quality, mozjpeg: true });
    } else if (ext === '.png') {
      pipeline = pipeline.png({ quality: variantSpec.quality, compressionLevel: 9 });
    } else if (ext === '.webp') {
      pipeline = pipeline.webp({ quality: variantSpec.quality });
    } else if (ext === '.avif') {
      pipeline = pipeline.avif({ quality: variantSpec.quality });
    }

    await pipeline.toFile(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function syncMediaVariantsForPicturesFolder(
  picturesPath: string,
  picturesFolderName: string,
) {
  if (!picturesPath || path.basename(picturesPath) !== picturesFolderName) {
    return;
  }

  const entries = await readdir(picturesPath, { withFileTypes: true }).catch(() => []);
  const originalFiles = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((entryName) => isSupportedImagePath(path.join(picturesPath, entryName)));
  const originalFileNameSet = new Set(originalFiles);

  for (const [variant, variantDirectoryName] of Object.entries(mediaVariantDirectoryByVariant) as Array<[SupportedMediaVariant, string]>) {
    const variantFolderPath = path.join(picturesPath, variantDirectoryName);
    await mkdir(variantFolderPath, { recursive: true });

    const variantEntries = await readdir(variantFolderPath, { withFileTypes: true }).catch(() => []);
    for (const entry of variantEntries) {
      if (!entry.isFile()) {
        continue;
      }

      if (!originalFileNameSet.has(entry.name)) {
        await unlink(path.join(variantFolderPath, entry.name)).catch(() => undefined);
      }
    }

    for (const sourceName of originalFiles) {
      const sourcePath = path.join(picturesPath, sourceName);
      const targetPath = path.join(variantFolderPath, sourceName);
      await ensureMediaVariantGenerated(sourcePath, targetPath, variant);
    }
  }
}

function parseScreenshotIndex(value: string) {
  const stem = path.parse(value).name;
  const match = stem.match(/^screen(\d+)$/i);
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1] ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

async function invalidateScreenshotVariants(
  picturesPath: string,
  picturesFolderName: string,
  shouldInvalidate: (index: number) => boolean,
) {
  if (!picturesPath || path.basename(picturesPath) !== picturesFolderName) {
    return;
  }

  for (const variantDirectoryName of Object.values(mediaVariantDirectoryByVariant)) {
    const variantFolderPath = path.join(picturesPath, variantDirectoryName);
    const entries = await readdir(variantFolderPath, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const index = parseScreenshotIndex(entry.name);
      if (index === null || !shouldInvalidate(index)) {
        continue;
      }

      await unlink(path.join(variantFolderPath, entry.name)).catch(() => undefined);
    }
  }
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
    await decompressVersionFromStorage(resolvedGamePath, preferredVersion.path, preferredVersion.name, 'http-service-version-storage', appendLogEvent);
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

      const handledArchiveUploadRoute = await handleArchiveUploadRoutes({
        method,
        route,
        request,
        response,
        resolveRequestCapabilities,
        readJsonBody,
        sendOk,
        sendError,
        toErrorMessage,
        stagedUploads: stagedArchiveUploads,
        appendLogEvent,
        loadRuntimeConfig,
        saveGameMetadata,
      });
      if (handledArchiveUploadRoute) {
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
        const variant = normalizeMediaImageVariant(requestUrl.searchParams.get('variant'));
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

        let resolvedRenderPath = resolvedMediaPath;
        if (variant !== 'original') {
          const variantPath = resolveMediaVariantPath(resolvedMediaPath, variant, config.picturesFolderName);
          const supportedVariant = toSupportedMediaVariant(variant);
          if (variantPath && supportedVariant && isAllowedMediaPath(variantPath, config)) {
            const generated = await ensureMediaVariantGenerated(resolvedMediaPath, variantPath, supportedVariant);
            if (generated && await fileExists(variantPath)) {
              resolvedRenderPath = variantPath;
            }
          }
        }

        try {
          const fileStats = await stat(resolvedRenderPath);
          if (!fileStats.isFile()) {
            sendError(response, 404, 'media_not_found', 'Media file not found.');
            return;
          }

          const fileContents = await readFile(resolvedRenderPath);
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
          const operationId = String(payload.operationId ?? '').trim() || `http-vs-${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const versionName = String(payload.versionName ?? '').trim() || path.basename(versionPath || gamePath || 'Version');
          const gameName = path.basename(gamePath || 'Game');
          if (!gamePath || !versionPath) {
            sendError(response, 400, 'invalid_version_storage_payload', 'Game path and version path are required for compression.');
            return;
          }

          setVersionStorageProgress({
            operationId,
            operation: 'compress',
            phase: 'preparing',
            percent: 0.02,
            processedBytes: 0,
            totalBytes: 0,
            gamePath,
            versionPath,
            gameName,
            versionName,
          });

          const result = await compressVersionForStorage(
            gamePath,
            versionPath,
            versionName,
            'http-service-version-storage',
            appendLogEvent,
            (update) => {
              setVersionStorageProgress({
                operationId,
                operation: update.operation,
                phase: update.phase,
                percent: update.percent,
                processedBytes: update.processedBytes ?? 0,
                totalBytes: update.totalBytes ?? 0,
                gamePath,
                versionPath,
                gameName,
                versionName,
              }, update.phase === 'finalizing' && update.percent >= 1);
            },
          );
          setVersionStorageProgress({
            operationId,
            operation: 'compress',
            phase: 'finalizing',
            percent: 1,
            processedBytes: 0,
            totalBytes: 0,
            gamePath,
            versionPath,
            gameName,
            versionName,
          }, true);
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
          const operationId = String(payload.operationId ?? '').trim() || `http-vs-${Date.now()}-${Math.random().toString(16).slice(2)}`;
          const versionName = String(payload.versionName ?? '').trim() || path.basename(versionPath || gamePath || 'Version');
          const gameName = path.basename(gamePath || 'Game');
          if (!gamePath || !versionPath) {
            sendError(response, 400, 'invalid_version_storage_payload', 'Game path and version path are required for decompression.');
            return;
          }

          setVersionStorageProgress({
            operationId,
            operation: 'decompress',
            phase: 'preparing',
            percent: 0.02,
            processedBytes: 0,
            totalBytes: 0,
            gamePath,
            versionPath,
            gameName,
            versionName,
          });

          const result = await decompressVersionFromStorage(
            gamePath,
            versionPath,
            versionName,
            'http-service-version-storage',
            appendLogEvent,
            (update) => {
              setVersionStorageProgress({
                operationId,
                operation: update.operation,
                phase: update.phase,
                percent: update.percent,
                processedBytes: update.processedBytes ?? 0,
                totalBytes: update.totalBytes ?? 0,
                gamePath,
                versionPath,
                gameName,
                versionName,
              }, update.phase === 'finalizing' && update.percent >= 1);
            },
          );
          setVersionStorageProgress({
            operationId,
            operation: 'decompress',
            phase: 'finalizing',
            percent: 1,
            processedBytes: 0,
            totalBytes: 0,
            gamePath,
            versionPath,
            gameName,
            versionName,
          }, true);
          sendOk(response, result);
        } catch (error) {
          sendError(response, 400, 'decompress_version_failed', toErrorMessage(error, 'Failed to decompress version.'));
        }
        return;
      }

      if (method === 'GET' && route === '/api/version-storage/progress') {
        const operationId = String(requestUrl.searchParams.get('operationId') ?? '').trim();
        if (!operationId) {
          sendError(response, 400, 'missing_operation_id', 'Operation id is required.');
          return;
        }

        const snapshot = versionStorageProgressByOperationId.get(operationId);
        sendOk(response, {
          progress: snapshot
            ? {
                ...snapshot.event,
                completed: snapshot.completed,
                updatedAt: snapshot.updatedAt,
              }
            : null,
        });
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

      if (method === 'POST' && route === '/api/scan-game-sizes') {
        try {
          const payload = await readJsonBody<ScanGameSizesPayload>(request);
          const gamePaths = Array.isArray(payload?.gamePaths) ? payload.gamePaths : [];
          const config = await loadRuntimeConfig();
          const result: ScanGameSizesResult = {
            sizes: await scanGameSizes(config, gamePaths),
          };
          sendOk(response, result);
        } catch (error) {
          sendError(response, 400, 'scan_game_sizes_failed', toErrorMessage(error, 'Failed to scan game sizes.'));
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
          const config = await loadRuntimeConfig();
          const picturesPath = path.dirname(payload.fromPath);
          const fromIndex = parseScreenshotIndex(payload.fromPath);
          const toIndex = parseScreenshotIndex(payload.toPath);
          await runMediaMutationLocked(picturesPath, async () => {
            await reorderScreenshots(payload.fromPath, payload.toPath);

            const affectedIndexes = new Set<number>();
            if (fromIndex !== null) {
              affectedIndexes.add(fromIndex);
            }
            if (toIndex !== null) {
              affectedIndexes.add(toIndex);
            }

            if (affectedIndexes.size > 0) {
              await invalidateScreenshotVariants(picturesPath, config.picturesFolderName, (index) => affectedIndexes.has(index));
            }

            await syncMediaVariantsForPicturesFolder(picturesPath, config.picturesFolderName);
          });
          sendOk(response, { reordered: true });
        } catch (error) {
          sendError(response, 400, 'screenshot_reorder_failed', toErrorMessage(error, 'Failed to reorder screenshots.'));
        }
        return;
      }

      if (method === 'POST' && route === '/api/media/remove-screenshot') {
        try {
          const payload = await readJsonBody<RemoveScreenshotPayload>(request);
          const config = await loadRuntimeConfig();
          const picturesPath = path.dirname(payload.screenshotPath);
          const removedIndex = parseScreenshotIndex(payload.screenshotPath);
          await runMediaMutationLocked(picturesPath, async () => {
            await removeScreenshot(payload.screenshotPath);

            if (removedIndex !== null) {
              await invalidateScreenshotVariants(picturesPath, config.picturesFolderName, (index) => index >= removedIndex);
            }

            await syncMediaVariantsForPicturesFolder(picturesPath, config.picturesFolderName);
          });
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
          const importedCount = await runMediaMutationLocked(picturesPath, async () => {
            await mkdir(picturesPath, { recursive: true });

            const pictureEntries = await readdir(picturesPath, { withFileTypes: true }).catch(() => []);
            const existingFileNames = pictureEntries.filter((entry) => entry.isFile()).map((entry) => entry.name);
            let nextImportedCount = 0;

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
                nextImportedCount += 1;
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
                  nextImportedCount = 1;
                }
              }
            }

            await syncMediaVariantsForPicturesFolder(picturesPath, config.picturesFolderName);
            return nextImportedCount;
          });

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
