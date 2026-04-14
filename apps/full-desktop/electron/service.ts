/**
 * HTTP service host for browser/mobile gallery access over LAN/Tailscale.
 *
 * New to this project: this module exposes transport-safe endpoints that mirror
 * core desktop IPC operations so non-Electron clients can use shared contracts.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { spawn } from 'node:child_process';
import { appendFile, mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  type GalleryConfig,
  type LogEventPayload,
  type OpenFolderPayload,
  type OpenFolderResult,
  type PlayGamePayload,
  type PlayGameResult,
  type RemoveScreenshotPayload,
  type ReorderScreenshotsPayload,
  type SaveGameMetadataPayload,
  type ScanResult,
  type ServiceApiVersionInfo,
  type ServiceCapabilities,
  type ServiceHealthStatus,
} from '../src/types';
import { loadConfig, saveConfig } from './config';
import { getLatestVersionName, readGameMetadata, reorderScreenshots, removeScreenshot, saveGameMetadata } from './game-library';
import { appendLogEvent, clearLogContents, readLogContents } from './logger';
import { scanGames } from './scanner';

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

function isAllowedMediaPath(targetPath: string, config: GalleryConfig) {
  const rootPath = String(config.gamesRoot ?? '').trim();
  if (rootPath) {
    const resolvedRoot = path.resolve(rootPath);
    if (isPathInside(resolvedRoot, targetPath)) {
      return true;
    }
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
  })).filter((version) => version.path);

  const metadata = await readGameMetadata(resolvedGamePath, gameName, versions);
  const detectedLatestVersion = getLatestVersionName(versions);
  const hasVersionMismatch = Boolean(
    detectedLatestVersion
    && metadata.latestVersion
    && detectedLatestVersion !== metadata.latestVersion,
  );

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

  const searchFolders = launchMode === 'choose-version-temporary' && versions.length
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

  if (config.gamesRoot === containerGamesRoot) {
    return config;
  }

  return {
    ...config,
    gamesRoot: containerGamesRoot,
  };
}

async function loadRuntimeConfig() {
  const config = await loadConfig();
  const runtimeScopedConfig = applyRuntimeConfigPolicy(config);

  if (runtimeScopedConfig.gamesRoot === config.gamesRoot) {
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

    return {
      supportsLaunch,
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
          const config = await loadRuntimeConfig();
          const scanResult: ScanResult = await scanGames(config);
          sendOk(response, scanResult);
        } catch (error) {
          sendError(response, 400, 'scan_failed', toErrorMessage(error, 'Scan failed.'));
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
          const configuredRootPath = String(config.gamesRoot ?? '').trim();
          if (!configuredRootPath) {
            sendError(response, 400, 'missing_games_root', 'Games root is not configured on host.');
            return;
          }

          const resolvedRoot = path.resolve(configuredRootPath);
          const resolvedGamePath = path.resolve(String(payload.gamePath ?? '').trim());

          if (!resolvedRoot || !isPathInside(resolvedRoot, resolvedGamePath)) {
            sendError(response, 403, 'forbidden_game_path', 'Target game path is outside allowed gallery root.');
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
