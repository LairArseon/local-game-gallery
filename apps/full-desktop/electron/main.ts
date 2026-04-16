/**
 * Electron main process bootstrap, IPC wiring, and desktop integrations.
 *
 * New to this project: this is the desktop integration hub; start with ipcMain handlers to map renderer window.gallery calls to filesystem/process operations.
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from 'electron';
import type { OpenDialogOptions } from 'electron';
import { access, appendFile, copyFile, mkdir, mkdtemp, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { loadConfig, saveConfig } from './config';
import { appendLogEvent, clearLogContents, openLogFolder, readLogContents } from './logger';
import { getLatestVersionName, importDroppedGameMedia, readGameMetadata, removeScreenshot, reorderScreenshots, saveGameMetadata } from './game-library';
import { scanGame, scanGames } from './scanner';
import { startGalleryHttpService, type GalleryHttpService } from './service';
import type {
  ApplyRuntimeAppIconPayload,
  ApplyRuntimeAppIconResult,
  AppIconInspectPayload,
  AppIconInspectResult,
  StageDroppedAppIconPayload,
  GameContextMenuPayload,
  GalleryConfig,
  ImportDroppedGameMediaPayload,
  ImportGameMediaPayload,
  LogEventPayload,
  OpenFolderPayload,
  OpenFolderResult,
  PlayGamePayload,
  PlayGameResult,
  RemoveScreenshotPayload,
  ReorderScreenshotsPayload,
  ScanRequestOptions,
  SaveGameMetadataPayload,
  SaveExtraDownloadPayload,
  SaveExtraDownloadResult,
  SaveVersionDownloadPayload,
  SaveVersionDownloadResult,
  ServiceApiVersionInfo,
  ServiceCapabilities,
  ServiceHealthStatus,
  VaultContextMenuPayload,
  VersionContextMenuPayload,
} from '../src/types';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let galleryHttpService: GalleryHttpService | null = null;
let isQuitRequested = false;
const mainProcessStartedAt = new Date().toISOString();

function getServiceHealthSnapshot(): ServiceHealthStatus {
  if (galleryHttpService) {
    return galleryHttpService.getHealth();
  }

  return {
    status: 'degraded',
    startedAt: mainProcessStartedAt,
    host: '127.0.0.1',
    port: 0,
    transport: 'http',
  };
}

function getDesktopServiceCapabilities(): ServiceCapabilities {
  return {
    supportsLaunch: true,
    supportsHostFolderPicker: true,
    launchPolicy: 'host-desktop-only',
    supportsNativeContextMenu: true,
    supportsTrayLifecycle: true,
    clientMode: 'desktop',
    isContainerized: false,
    isGamesRootEditable: true,
  };
}

function buildTrayMenu() {
  const isWindowVisible = Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible());
  const startedAtLabel = new Date(mainProcessStartedAt).toLocaleString();
  const health = getServiceHealthSnapshot();
  const serviceStatusLabel = health.status === 'ok'
    ? 'Running'
    : health.status === 'starting'
      ? 'Starting'
      : 'Degraded';
  const endpointLabel = health.port > 0
    ? `Endpoint: http://${health.host}:${health.port}`
    : 'Endpoint: unavailable';

  return Menu.buildFromTemplate([
    {
      label: isWindowVisible ? 'Focus app window' : 'Open app window',
      click: () => {
        void showMainWindow();
      },
    },
    {
      label: 'Hide app window',
      enabled: isWindowVisible,
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.hide();
        }
      },
    },
    { type: 'separator' },
    { label: `Service status: ${serviceStatusLabel}`, enabled: false },
    { label: endpointLabel, enabled: false },
    { label: `Started: ${startedAtLabel}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Exit app and stop service',
      click: () => {
        requestAppQuit();
      },
    },
  ]);
}

function refreshTrayMenu() {
  if (!tray) {
    return;
  }

  const health = getServiceHealthSnapshot();
  const tooltipStatus = health.status === 'ok' ? 'running' : health.status;
  const endpoint = health.port > 0 ? `http://${health.host}:${health.port}` : 'unavailable';
  tray.setToolTip(`Local Game Gallery service ${tooltipStatus} (${endpoint})`);
  tray.setContextMenu(buildTrayMenu());
}

function resolveTrayIcon() {
  const scriptInstallRoot = path.resolve(__dirname, '..', '..');
  const runtimeInstallRoot = path.resolve(path.dirname(process.execPath), '..', '..');

  const iconCandidates = [
    path.join(scriptInstallRoot, 'icon', 'full-desktop-icon', 'icon.ico'),
    path.join(scriptInstallRoot, 'icon', 'full-desktop-icon', 'icon.png'),
    path.join(scriptInstallRoot, 'icon', 'standalone-client-icon', 'icon.ico'),
    path.join(scriptInstallRoot, 'icon', 'standalone-client-icon', 'icon.png'),
    path.join(scriptInstallRoot, 'icon', 'icon.ico'),
    path.join(scriptInstallRoot, 'icon', 'icon.png'),
    path.join(runtimeInstallRoot, 'icon', 'full-desktop-icon', 'icon.ico'),
    path.join(runtimeInstallRoot, 'icon', 'full-desktop-icon', 'icon.png'),
    path.join(runtimeInstallRoot, 'icon', 'standalone-client-icon', 'icon.ico'),
    path.join(runtimeInstallRoot, 'icon', 'standalone-client-icon', 'icon.png'),
    path.join(runtimeInstallRoot, 'icon', 'icon.ico'),
    path.join(runtimeInstallRoot, 'icon', 'icon.png'),
    path.join(app.getAppPath(), 'icon', 'full-desktop-icon', 'icon.ico'),
    path.join(app.getAppPath(), 'icon', 'full-desktop-icon', 'icon.png'),
    path.join(app.getAppPath(), 'icon', 'standalone-client-icon', 'icon.ico'),
    path.join(app.getAppPath(), 'icon', 'standalone-client-icon', 'icon.png'),
    path.join(app.getAppPath(), 'icon', 'icon.ico'),
    path.join(app.getAppPath(), 'icon', 'icon.png'),
    path.join(process.cwd(), 'icon', 'full-desktop-icon', 'icon.ico'),
    path.join(process.cwd(), 'icon', 'full-desktop-icon', 'icon.png'),
    path.join(process.cwd(), 'icon', 'standalone-client-icon', 'icon.ico'),
    path.join(process.cwd(), 'icon', 'standalone-client-icon', 'icon.png'),
    path.join(process.cwd(), 'icon', 'icon.ico'),
    path.join(process.cwd(), 'icon', 'icon.png'),
    process.execPath,
  ];

  for (const candidatePath of iconCandidates) {
    const image = nativeImage.createFromPath(candidatePath);
    if (!image.isEmpty()) {
      if (process.platform === 'win32') {
        const resized = image.resize({ width: 16, height: 16, quality: 'best' });
        if (!resized.isEmpty()) {
          return resized;
        }
      }

      return image;
    }
  }

  return nativeImage.createFromPath(process.execPath);
}

function ensureTray() {
  if (tray) {
    return;
  }

  tray = new Tray(resolveTrayIcon());
  refreshTrayMenu();

  tray.on('click', () => {
    void showMainWindow();
  });

  tray.on('double-click', () => {
    void showMainWindow();
  });
}

async function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
    refreshTrayMenu();
    return;
  }

  await createWindow();
  refreshTrayMenu();
}

function requestAppQuit() {
  isQuitRequested = true;
  app.quit();
}

function applyMenuBarVisibility(window: BrowserWindow, visible: boolean) {
  if (process.platform === 'darwin') {
    return;
  }

  window.setAutoHideMenuBar(!visible);
  window.setMenuBarVisibility(visible);
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findExecutablesInFolder(folderPath: string): Promise<string[]> {
  const matches: string[] = [];

  let entries: { isDirectory: () => boolean; isFile: () => boolean; name: string }[] = [];
  try {
    entries = await readdir(folderPath, { withFileTypes: true, encoding: 'utf8' });
  } catch {
    return matches;
  }

  for (const entry of entries) {
    if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.exe') {
      matches.push(path.join(folderPath, entry.name));
    }
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

function toDownloadSafeFileName(value: string) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return 'download';
  }

  return normalized.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
}

function isPathInside(parentPath: string, targetPath: string) {
  const relative = path.relative(parentPath, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
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

function launchExecutable(executablePath: string) {
  const processHandle = spawn(executablePath, [], {
    cwd: path.dirname(executablePath),
    detached: true,
    stdio: 'ignore',
  });
  processHandle.unref();
}

async function setWindowsHiddenAttribute(targetPath: string, hidden: boolean) {
  if (process.platform !== 'win32') {
    return;
  }

  if (!(await fileExists(targetPath))) {
    return;
  }

  const runAttrib = (command: string, args: string[]) => new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderrOutput = '';

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderrOutput += chunk.toString();
    });

    child.once('error', (error) => {
      reject(error);
    });

    child.once('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const stderrText = stderrOutput.trim();
      reject(new Error(stderrText || `${command} exited with code ${String(code ?? 'unknown')}`));
    });
  });

  const attribFlag = hidden ? '+h' : '-h';

  try {
    await runAttrib('attrib.exe', [attribFlag, targetPath]);
  } catch {
    // Some environments do not expose attrib.exe in PATH for direct spawn.
    await runAttrib('cmd.exe', ['/d', '/s', '/c', `attrib ${attribFlag} "${targetPath}"`]);
  }
}

async function appendGameLaunchActivity(gamePath: string) {
  const activityLogPath = path.join(gamePath, 'activitylog');
  const timestamp = new Date().toISOString();
  await appendFile(activityLogPath, `${timestamp}\n`, 'utf8');
}

function isPngBuffer(buffer: Buffer) {
  if (buffer.length < 8) {
    return false;
  }

  return buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a;
}

async function createWindow() {
  const config = await loadConfig();
  const configuredIconPath = String(config.appIconPngPath ?? '').trim();
  const configuredIcon = configuredIconPath ? nativeImage.createFromPath(configuredIconPath) : null;
  const startupIcon = configuredIcon && !configuredIcon.isEmpty() ? configuredIcon : undefined;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#10131b',
    icon: startupIcon,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: process.platform === 'darwin' ? false : !config.showSystemMenuBar,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (startupIcon) {
    mainWindow.setIcon(startupIcon);
  }

  mainWindow.on('close', (event) => {
    if (isQuitRequested || process.platform === 'darwin') {
      return;
    }

    // Keep backend lifecycle alive in tray when user closes the desktop window.
    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on('show', () => {
    refreshTrayMenu();
  });

  mainWindow.on('hide', () => {
    refreshTrayMenu();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    refreshTrayMenu();
  });

  applyMenuBarVisibility(mainWindow, config.showSystemMenuBar);

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    const key = input.key.toLowerCase();
    const code = input.code.toLowerCase();
    const hasCommandModifier = input.control || input.meta;
    const isToggleDevtools = key === 'f12' || ((input.control || input.meta) && input.shift && key === 'i');
    const isNativeZoomShortcut = hasCommandModifier
      && (key === '+' || key === '=' || key === '-' || key === '_' || key === '0' || code === 'numpadadd' || code === 'numpadsubtract');

    if (isNativeZoomShortcut) {
      // Prevent Chromium zoom shortcuts so in-app zoom is the single source of truth.
      _event.preventDefault();
      return;
    }

    if (!isToggleDevtools) {
      return;
    }

    mainWindow?.webContents.toggleDevTools();
  });

  // Keep Chromium zoom factor stable; app-managed zoom uses CSS scales in renderer.
  mainWindow.webContents.setZoomFactor(1);

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('Renderer failed to load', { errorCode, errorDescription, validatedURL });
  });
}

ipcMain.handle('gallery:get-config', async () => loadConfig());

ipcMain.handle('gallery:get-app-version', async () => app.getVersion());

ipcMain.handle('gallery:get-api-version', async (): Promise<ServiceApiVersionInfo> => ({
  apiVersion: 'desktop-ipc-v1',
  serviceName: 'local-game-gallery-desktop',
  serviceBuild: app.getVersion(),
}));

ipcMain.handle('gallery:get-service-capabilities', async (): Promise<ServiceCapabilities> => getDesktopServiceCapabilities());

ipcMain.handle('gallery:get-service-health', async (): Promise<ServiceHealthStatus> => getServiceHealthSnapshot());

ipcMain.handle('gallery:save-config', async (_event, config: GalleryConfig) => {
  const previousConfig = await loadConfig();
  const savedConfig = await saveConfig(config);

  const previousVaultSet = new Set(previousConfig.vaultedGamePaths ?? []);
  const nextVaultSet = new Set(savedConfig.vaultedGamePaths ?? []);

  const newlyVaulted = [...nextVaultSet].filter((gamePath) => !previousVaultSet.has(gamePath));
  const newlyUnvaulted = [...previousVaultSet].filter((gamePath) => !nextVaultSet.has(gamePath));

  for (const gamePath of newlyVaulted) {
    try {
      await setWindowsHiddenAttribute(gamePath, true);
    } catch (error) {
      await appendLogEvent({
        level: 'warn',
        source: 'main-save-config',
        message: `Failed to hide vaulted folder "${gamePath}": ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  for (const gamePath of newlyUnvaulted) {
    try {
      await setWindowsHiddenAttribute(gamePath, false);
    } catch (error) {
      await appendLogEvent({
        level: 'warn',
        source: 'main-save-config',
        message: `Failed to unhide unvaulted folder "${gamePath}": ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return savedConfig;
});

ipcMain.handle('gallery:pick-games-root', async () => {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow;
  const options: OpenDialogOptions = {
    properties: ['openDirectory'],
    title: 'Choose your main games folder',
  };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0] ?? null;
});

ipcMain.handle('gallery:pick-metadata-mirror-root', async () => {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow;
  const options: OpenDialogOptions = {
    properties: ['openDirectory'],
    title: 'Choose metadata mirror folder',
  };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0] ?? null;
});

ipcMain.handle('gallery:pick-app-icon-png', async () => {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow;
  const options: OpenDialogOptions = {
    properties: ['openFile'],
    filters: [{ name: 'PNG images', extensions: ['png'] }],
    title: 'Choose a PNG app icon',
  };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0] ?? null;
});

ipcMain.handle('gallery:inspect-app-icon-file', async (_event, payload: AppIconInspectPayload): Promise<AppIconInspectResult> => {
  const filePath = String(payload.filePath ?? '').trim();
  if (!filePath) {
    return {
      isValid: false,
      message: 'No icon path provided.',
      width: 0,
      height: 0,
      willPadToSquare: false,
    };
  }

  if (path.extname(filePath).toLowerCase() !== '.png') {
    return {
      isValid: false,
      message: 'Only PNG files are supported for app icons.',
      width: 0,
      height: 0,
      willPadToSquare: false,
    };
  }

  if (!(await fileExists(filePath))) {
    return {
      isValid: false,
      message: 'Selected icon file was not found on disk.',
      width: 0,
      height: 0,
      willPadToSquare: false,
    };
  }

  const image = nativeImage.createFromPath(filePath);
  if (image.isEmpty()) {
    return {
      isValid: false,
      message: 'Could not read PNG image data from the selected file.',
      width: 0,
      height: 0,
      willPadToSquare: false,
    };
  }

  const size = image.getSize();
  const minSize = 256;
  const isLargeEnough = size.width >= minSize && size.height >= minSize;
  const willPadToSquare = size.width !== size.height;
  if (!isLargeEnough) {
    return {
      isValid: false,
      message: `Icon must be at least ${minSize}x${minSize}px. Current size is ${size.width}x${size.height}px.`,
      width: size.width,
      height: size.height,
      willPadToSquare,
    };
  }

  return {
    isValid: true,
    message: willPadToSquare
      ? 'Valid PNG icon. It will be padded to a square during ICO conversion.'
      : 'Valid PNG icon. Ready for the build icon pipeline.',
    width: size.width,
    height: size.height,
    willPadToSquare,
  };
});

ipcMain.handle('gallery:stage-dropped-app-icon', async (_event, payload: StageDroppedAppIconPayload): Promise<string> => {
  const fileName = String(payload.fileName ?? '').trim();
  const stagedBuffer = Buffer.from(payload.buffer ?? new ArrayBuffer(0));

  if (!stagedBuffer.length) {
    throw new Error('Dropped file data is empty. Try selecting the file with Choose PNG.');
  }

  const hasPngExtension = path.extname(fileName).toLowerCase() === '.png';
  const hasPngSignature = isPngBuffer(stagedBuffer);
  if (!hasPngExtension && !hasPngSignature) {
    throw new Error('Dropped file must be a PNG image.');
  }

  const iconsDir = path.join(app.getPath('userData'), 'icons');
  const stagedPath = path.join(iconsDir, 'custom-app-icon.png');
  await mkdir(iconsDir, { recursive: true });
  await writeFile(stagedPath, stagedBuffer);
  return stagedPath;
});

ipcMain.handle('gallery:apply-runtime-app-icon', async (_event, payload: ApplyRuntimeAppIconPayload): Promise<ApplyRuntimeAppIconResult> => {
  const filePath = String(payload.filePath ?? '').trim();
  if (!filePath) {
    return {
      applied: false,
      message: 'Select an icon first.',
    };
  }

  if (!(await fileExists(filePath))) {
    return {
      applied: false,
      message: 'Selected icon file was not found.',
    };
  }

  const image = nativeImage.createFromPath(filePath);
  if (image.isEmpty()) {
    return {
      applied: false,
      message: 'Could not load icon image for runtime apply.',
    };
  }

  const window = BrowserWindow.getFocusedWindow() ?? mainWindow;
  if (!window) {
    return {
      applied: false,
      message: 'App window is not available right now.',
    };
  }

  window.setIcon(image);
  return {
    applied: true,
    message: 'Runtime icon applied for current app session.',
  };
});

ipcMain.handle('gallery:scan-games', async (_event, requestOptions?: ScanRequestOptions) => {
  const config = await loadConfig();
  try {
    return await scanGames(config, requestOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scan failed.';
    await appendLogEvent({
      level: 'error',
      source: 'scan-sync',
      message: `Desktop scan request failed: ${message}`,
    }).catch(() => undefined);
    throw error;
  }
});

ipcMain.handle('gallery:scan-game', async (_event, payload: { gamePath: string }) => {
  const config = await loadConfig();
  const gamePath = String(payload?.gamePath ?? '').trim();
  if (!gamePath) {
    return null;
  }

  try {
    return await scanGame(config, gamePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Single game scan failed.';
    await appendLogEvent({
      level: 'warn',
      source: 'scan-single-game',
      message: `Desktop single game scan failed for "${gamePath}": ${message}`,
    }).catch(() => undefined);
    return null;
  }
});

ipcMain.handle('gallery:save-game-metadata', async (_event, payload: SaveGameMetadataPayload) => {
  await saveGameMetadata(payload);
});

ipcMain.handle('gallery:import-game-media-dialog', async (_event, payload: ImportGameMediaPayload) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    title: 'Select image files',
  });

  if (result.canceled || !result.filePaths.length) {
    return;
  }

  const config = await loadConfig();
  await importDroppedGameMedia(config.picturesFolderName, {
    ...payload,
    filePaths: result.filePaths,
  });
});

ipcMain.handle('gallery:import-dropped-game-media', async (_event, payload: ImportDroppedGameMediaPayload) => {
  const config = await loadConfig();
  await importDroppedGameMedia(config.picturesFolderName, payload);
});

ipcMain.handle('gallery:reorder-screenshots', async (_event, payload: ReorderScreenshotsPayload) => {
  await reorderScreenshots(payload.fromPath, payload.toPath);
});

ipcMain.handle('gallery:remove-screenshot', async (_event, payload: RemoveScreenshotPayload) => {
  await removeScreenshot(payload.screenshotPath);
});

ipcMain.handle('gallery:save-extra-download', async (_event, payload: SaveExtraDownloadPayload): Promise<SaveExtraDownloadResult> => {
  const gamePath = String(payload?.gamePath ?? '').trim();
  const relativePath = String(payload?.relativePath ?? '').trim();
  const suggestedName = String(payload?.suggestedName ?? '').trim();

  if (!gamePath || !relativePath) {
    const message = 'Game path and extra path are required for download.';
    await appendLogEvent({
      level: 'warn',
      source: 'main-save-extra-download',
      message,
    }).catch(() => undefined);
    return {
      saved: false,
      canceled: false,
      savedPath: null,
      message,
    };
  }

  const extrasRoot = path.resolve(gamePath, 'extras');
  const resolvedTargetPath = path.resolve(extrasRoot, relativePath);

  if (!isPathInside(extrasRoot, resolvedTargetPath)) {
    const message = 'Invalid extra download path.';
    await appendLogEvent({
      level: 'warn',
      source: 'main-save-extra-download',
      message: `Blocked extras download path traversal attempt for "${relativePath}" in game "${gamePath}".`,
    }).catch(() => undefined);
    return {
      saved: false,
      canceled: false,
      savedPath: null,
      message,
    };
  }

  let targetStats: Awaited<ReturnType<typeof stat>>;
  try {
    targetStats = await stat(resolvedTargetPath);
  } catch {
    const message = 'Selected extra was not found on disk.';
    await appendLogEvent({
      level: 'warn',
      source: 'main-save-extra-download',
      message: `Extras download target missing: "${resolvedTargetPath}"`,
    }).catch(() => undefined);
    return {
      saved: false,
      canceled: false,
      savedPath: null,
      message,
    };
  }

  const baseName = toDownloadSafeFileName(suggestedName || path.basename(resolvedTargetPath));
  const defaultFileName = targetStats.isDirectory() ? `${baseName}.zip` : baseName;
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow;
  const saveDialogResult = window
    ? await dialog.showSaveDialog(window, {
      title: 'Save extra as',
      defaultPath: defaultFileName,
      buttonLabel: 'Save',
    })
    : await dialog.showSaveDialog({
      title: 'Save extra as',
      defaultPath: defaultFileName,
      buttonLabel: 'Save',
    });

  if (saveDialogResult.canceled || !saveDialogResult.filePath) {
    await appendLogEvent({
      level: 'warn',
      source: 'main-save-extra-download',
      message: `Extras save dialog canceled for "${relativePath}".`,
    }).catch(() => undefined);
    return {
      saved: false,
      canceled: true,
      savedPath: null,
      message: 'Download cancelled.',
    };
  }

  const destinationPath = path.resolve(saveDialogResult.filePath);
  try {
    if (targetStats.isDirectory()) {
      await appendLogEvent({
        level: 'info',
        source: 'main-save-extra-download',
        message: `Preparing folder extra download for "${relativePath}".`,
      }).catch(() => undefined);

      const tempDir = await mkdtemp(path.join(os.tmpdir(), 'lgg-extra-'));
      const tempZipPath = path.join(tempDir, defaultFileName);
      try {
        await appendLogEvent({
          level: 'info',
          source: 'main-save-extra-download',
          message: `Creating temporary zip "${tempZipPath}" from "${resolvedTargetPath}".`,
        }).catch(() => undefined);
        await createZipFromFolder(resolvedTargetPath, tempZipPath);
        await appendLogEvent({
          level: 'info',
          source: 'main-save-extra-download',
          message: `Temporary zip created. Copying to "${destinationPath}".`,
        }).catch(() => undefined);
        await copyFile(tempZipPath, destinationPath);
      } finally {
        await unlink(tempZipPath).catch(() => undefined);
        await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      }
    } else {
      await copyFile(resolvedTargetPath, destinationPath);
    }

    await appendLogEvent({
      level: 'info',
      source: 'main-save-extra-download',
      message: `Saved extra "${relativePath}" to "${destinationPath}".`,
    }).catch(() => undefined);

    return {
      saved: true,
      canceled: false,
      savedPath: destinationPath,
      message: `Saved to ${destinationPath}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save extra.';
    await appendLogEvent({
      level: 'error',
      source: 'main-save-extra-download',
      message: `Failed saving extra "${relativePath}" to "${destinationPath}": ${message}`,
    }).catch(() => undefined);

    return {
      saved: false,
      canceled: false,
      savedPath: null,
      message,
    };
  }
});

ipcMain.handle('gallery:save-version-download', async (_event, payload: SaveVersionDownloadPayload): Promise<SaveVersionDownloadResult> => {
  const gamePath = String(payload?.gamePath ?? '').trim();
  const versionPath = String(payload?.versionPath ?? '').trim();
  const suggestedName = String(payload?.suggestedName ?? '').trim();

  if (!gamePath || !versionPath) {
    const message = 'Game path and version path are required for download.';
    await appendLogEvent({
      level: 'warn',
      source: 'main-save-version-download',
      message,
    }).catch(() => undefined);
    return {
      saved: false,
      canceled: false,
      savedPath: null,
      message,
    };
  }

  const resolvedGamePath = path.resolve(gamePath);
  const resolvedVersionPath = path.resolve(versionPath);
  if (!isPathInside(resolvedGamePath, resolvedVersionPath)) {
    const message = 'Invalid version download path.';
    await appendLogEvent({
      level: 'warn',
      source: 'main-save-version-download',
      message: `Blocked version download path traversal attempt for "${versionPath}" in game "${gamePath}".`,
    }).catch(() => undefined);
    return {
      saved: false,
      canceled: false,
      savedPath: null,
      message,
    };
  }

  let targetStats: Awaited<ReturnType<typeof stat>>;
  try {
    targetStats = await stat(resolvedVersionPath);
  } catch {
    const message = 'Selected version folder was not found on disk.';
    await appendLogEvent({
      level: 'warn',
      source: 'main-save-version-download',
      message: `Version download target missing: "${resolvedVersionPath}"`,
    }).catch(() => undefined);
    return {
      saved: false,
      canceled: false,
      savedPath: null,
      message,
    };
  }

  if (!targetStats.isDirectory()) {
    const message = 'Selected version path is not a folder.';
    return {
      saved: false,
      canceled: false,
      savedPath: null,
      message,
    };
  }

  const baseName = toDownloadSafeFileName(suggestedName || path.basename(resolvedVersionPath));
  const defaultFileName = `${baseName}.zip`;
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow;
  const saveDialogResult = window
    ? await dialog.showSaveDialog(window, {
      title: 'Save version as',
      defaultPath: defaultFileName,
      buttonLabel: 'Save',
    })
    : await dialog.showSaveDialog({
      title: 'Save version as',
      defaultPath: defaultFileName,
      buttonLabel: 'Save',
    });

  if (saveDialogResult.canceled || !saveDialogResult.filePath) {
    await appendLogEvent({
      level: 'warn',
      source: 'main-save-version-download',
      message: `Version save dialog canceled for "${versionPath}".`,
    }).catch(() => undefined);
    return {
      saved: false,
      canceled: true,
      savedPath: null,
      message: 'Download cancelled.',
    };
  }

  const destinationPath = path.resolve(saveDialogResult.filePath);
  try {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'lgg-version-'));
    const tempZipPath = path.join(tempDir, defaultFileName);
    try {
      await createZipFromFolder(resolvedVersionPath, tempZipPath);
      await copyFile(tempZipPath, destinationPath);
    } finally {
      await unlink(tempZipPath).catch(() => undefined);
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }

    await appendLogEvent({
      level: 'info',
      source: 'main-save-version-download',
      message: `Saved version "${versionPath}" to "${destinationPath}".`,
    }).catch(() => undefined);

    return {
      saved: true,
      canceled: false,
      savedPath: destinationPath,
      message: `Saved to ${destinationPath}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save version download.';
    await appendLogEvent({
      level: 'error',
      source: 'main-save-version-download',
      message: `Failed saving version "${versionPath}" to "${destinationPath}": ${message}`,
    }).catch(() => undefined);

    return {
      saved: false,
      canceled: false,
      savedPath: null,
      message,
    };
  }
});

ipcMain.handle('gallery:log-event', async (_event, payload: LogEventPayload) => {
  await appendLogEvent(payload);
});

ipcMain.handle('gallery:get-log-contents', async () => readLogContents());

ipcMain.handle('gallery:open-log-folder', async (): Promise<OpenFolderResult> => openLogFolder());

ipcMain.handle('gallery:clear-log-contents', async () => {
  await clearLogContents();
});

ipcMain.handle('gallery:set-menu-bar-visibility', async (_event, visible: boolean) => {
  if (!mainWindow) {
    return;
  }

  applyMenuBarVisibility(mainWindow, Boolean(visible));
});

ipcMain.handle('gallery:open-folder', async (_event, payload: OpenFolderPayload): Promise<OpenFolderResult> => {
  const result = await shell.openPath(payload.folderPath);
  if (result) {
    await appendLogEvent({
      level: 'error',
      source: 'main-open-folder',
      message: `Failed opening folder "${payload.folderPath}": ${result}`,
    });
    return {
      opened: false,
      message: result,
    };
  }

  await appendLogEvent({
    level: 'info',
    source: 'main-open-folder',
    message: `Opened folder "${payload.folderPath}"`,
  });

  return {
    opened: true,
    message: `Opened folder: ${payload.folderPath}`,
  };
});

ipcMain.handle('gallery:play-game', async (event, payload: PlayGamePayload): Promise<PlayGameResult> => {
  const launchMode = payload.launchMode ?? 'default';
  const metadata = await readGameMetadata(
    payload.gamePath,
    payload.gameName,
    payload.versions.map((version) => ({ ...version, hasNfo: false })),
  );

  const detectedLatestVersion = getLatestVersionName(
    payload.versions.map((version) => ({ ...version, hasNfo: false })),
  );
  const hasVersionMismatch = Boolean(
    detectedLatestVersion
    && metadata.latestVersion
    && detectedLatestVersion !== metadata.latestVersion,
  );
  const window = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;

  let versionsToSearch = payload.versions;
  if (launchMode === 'choose-version-temporary' && payload.versions.length > 1) {
    const versionOptions = payload.versions.map((version, index) => `${index + 1}. ${version.name}`);
    const versionButtons = payload.versions.map((version, index) => {
      const label = `${index + 1}) ${version.name}`;
      return label.length > 38 ? `${label.slice(0, 35)}...` : label;
    });

    const versionSelection = window
      ? await dialog.showMessageBox(window, {
        type: 'question',
        title: 'Choose Game Version',
        message: 'Select which game version to launch now.',
        detail: `This launch will not change your saved default executable.\n\n${versionOptions.join('\n')}`,
        buttons: [...versionButtons, 'Cancel'],
        cancelId: payload.versions.length,
        defaultId: 0,
        noLink: true,
      })
      : await dialog.showMessageBox({
      type: 'question',
      title: 'Choose Game Version',
      message: 'Select which game version to launch now.',
      detail: `This launch will not change your saved default executable.\n\n${versionOptions.join('\n')}`,
      buttons: [...versionButtons, 'Cancel'],
      cancelId: payload.versions.length,
      defaultId: 0,
      noLink: true,
    });

    if (versionSelection.response === payload.versions.length) {
      await appendLogEvent({
        level: 'warn',
        source: 'main-play-game',
        message: `Play canceled while choosing version for game "${payload.gameName}"`,
      });
      return {
        launched: false,
        executablePath: null,
        message: 'Play canceled.',
      };
    }

    versionsToSearch = [payload.versions[versionSelection.response] ?? payload.versions[0]];
  }

  const storedExecutable = metadata.launchExecutable.trim();
  if (storedExecutable && !hasVersionMismatch && launchMode === 'default') {
    const absoluteStoredPath = toExecutableAbsolutePath(payload.gamePath, storedExecutable);
    if (await fileExists(absoluteStoredPath)) {
      launchExecutable(absoluteStoredPath);
      await appendGameLaunchActivity(payload.gamePath);
      await appendLogEvent({
        level: 'info',
        source: 'main-play-game',
        message: `Launching stored executable "${absoluteStoredPath}" for game "${payload.gameName}"`,
      });
      return {
        launched: true,
        executablePath: absoluteStoredPath,
        message: `Launching ${path.basename(absoluteStoredPath)}.`,
      };
    }
  }

  const searchFolders = versionsToSearch.map((version) => version.path);
  const discoveredExecutables = [...new Set((await Promise.all(searchFolders.map((folder) => findExecutablesInFolder(folder)))).flat())].sort();

  if (!discoveredExecutables.length) {
    await appendLogEvent({
      level: 'warn',
      source: 'main-play-game',
      message: `No executable files found for game "${payload.gameName}"`,
    });
    return {
      launched: false,
      executablePath: null,
      message: launchMode === 'choose-version-temporary'
        ? 'No executable files found in the selected version folder.'
        : 'No executable files found in game version folders.',
    };
  }

  let selectedExecutable = discoveredExecutables[0];

  if (discoveredExecutables.length > 1) {
    const relativeOptions = discoveredExecutables.map((candidate, index) => `${index + 1}. ${path.relative(payload.gamePath, candidate)}`);
    const selectedIndexButtons = discoveredExecutables.map((candidate, index) => {
      const label = `${index + 1}) ${path.basename(candidate)}`;
      return label.length > 38 ? `${label.slice(0, 35)}...` : label;
    });

    const selectionTitle = launchMode === 'choose-version-temporary'
      ? 'Choose Executable (This Launch Only)'
      : hasVersionMismatch
        ? 'Choose Executable (Version Mismatch)'
        : 'Choose Executable';
    const selectionDetail = launchMode === 'choose-version-temporary'
      ? `Select which executable to use for this launch:\n\n${relativeOptions.join('\n')}\n\nThis will not change your saved default executable.`
      : hasVersionMismatch
        ? `Select which executable to use for this launch:\n\n${relativeOptions.join('\n')}\n\nYou'll be asked again until the version mismatch is resolved.`
        : `Select which one should be used by default:\n\n${relativeOptions.join('\n')}`;

    const selection = window
      ? await dialog.showMessageBox(window, {
        type: 'question',
        title: selectionTitle,
        message: 'Multiple executable files were found for this game.',
        detail: selectionDetail,
        buttons: [...selectedIndexButtons, 'Cancel'],
        cancelId: discoveredExecutables.length,
        defaultId: 0,
        noLink: true,
      })
      : await dialog.showMessageBox({
      type: 'question',
      title: selectionTitle,
      message: 'Multiple executable files were found for this game.',
      detail: selectionDetail,
      buttons: [...selectedIndexButtons, 'Cancel'],
      cancelId: discoveredExecutables.length,
      defaultId: 0,
      noLink: true,
    });

    if (selection.response === discoveredExecutables.length) {
      await appendLogEvent({
        level: 'warn',
        source: 'main-play-game',
        message: `Play canceled for game "${payload.gameName}"`,
      });
      return {
        launched: false,
        executablePath: null,
        message: 'Play canceled.',
      };
    }

    selectedExecutable = discoveredExecutables[selection.response] ?? discoveredExecutables[0];
  }

  if (launchMode === 'default') {
    metadata.launchExecutable = toStoredExecutablePath(payload.gamePath, selectedExecutable);
    await saveGameMetadata({
      gamePath: payload.gamePath,
      title: payload.gameName,
      metadata,
    });
  }

  launchExecutable(selectedExecutable);
  await appendGameLaunchActivity(payload.gamePath);
  await appendLogEvent({
    level: 'info',
    source: 'main-play-game',
    message: `Launching selected executable "${selectedExecutable}" for game "${payload.gameName}"`,
  });
  return {
    launched: true,
    executablePath: selectedExecutable,
    message: `Launching ${path.basename(selectedExecutable)}.`,
  };
});

ipcMain.handle('gallery:show-game-context-menu', (event, payload: GameContextMenuPayload) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    return;
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Open',
      click: () => {
        window.webContents.send('gallery:context-menu-action', {
          action: 'open',
          gamePath: payload.gamePath,
        });
      },
    },
    {
      label: 'Play',
      enabled: payload.canPlay !== false,
      click: () => {
        window.webContents.send('gallery:context-menu-action', {
          action: 'play',
          gamePath: payload.gamePath,
        });
      },
    },
    {
      label: 'Open game folder',
      click: () => {
        window.webContents.send('gallery:context-menu-action', {
          action: 'open-game-folder',
          gamePath: payload.gamePath,
        });
      },
    },
    { type: 'separator' },
    {
      label: 'Edit Metadata',
      click: () => {
        window.webContents.send('gallery:context-menu-action', {
          action: 'edit-metadata',
          gamePath: payload.gamePath,
        });
      },
    },
    {
      label: 'Manage Pictures',
      click: () => {
        window.webContents.send('gallery:context-menu-action', {
          action: 'manage-pictures',
          gamePath: payload.gamePath,
        });
      },
    },
  ];

  if (payload.isVaultOpen) {
    template.push({ type: 'separator' });
    template.push({
      label: payload.isGameVaulted ? 'Remove from vault' : 'Add to vault',
      click: () => {
        window.webContents.send('gallery:context-menu-action', {
          action: payload.isGameVaulted ? 'remove-from-vault' : 'add-to-vault',
          gamePath: payload.gamePath,
        });
      },
    });
  }

  const menu = Menu.buildFromTemplate(template);

  menu.popup({ window });
});

ipcMain.handle('gallery:show-version-context-menu', (event, payload: VersionContextMenuPayload) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    return;
  }

  const menu = Menu.buildFromTemplate([
    {
      label: 'Open version folder',
      click: () => {
        window.webContents.send('gallery:version-context-menu-action', {
          action: 'open-version-folder',
          versionPath: payload.versionPath,
        });
      },
    },
  ]);

  menu.popup({ window });
});

ipcMain.handle('gallery:show-vault-context-menu', (event, payload: VaultContextMenuPayload) => {
  if (!payload.isVaultOpen) {
    return;
  }

  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) {
    return;
  }

  const template: Electron.MenuItemConstructorOptions[] = [];
  if (payload.hasVaultPin) {
    template.push({
      label: 'Change vault PIN',
      click: () => {
        window.webContents.send('gallery:vault-context-menu-action', {
          action: 'change-vault-pin',
        });
      },
    });
    template.push({ type: 'separator' });
    template.push({
      label: 'Remove vault PIN',
      click: () => {
        window.webContents.send('gallery:vault-context-menu-action', {
          action: 'remove-vault-pin',
        });
      },
    });
  } else {
    template.push({
      label: 'Add vault PIN',
      click: () => {
        window.webContents.send('gallery:vault-context-menu-action', {
          action: 'add-vault-pin',
        });
      },
    });
  }

  const menu = Menu.buildFromTemplate(template);

  menu.popup({ window });
});

app.whenReady().then(async () => {
  try {
    galleryHttpService = await startGalleryHttpService({
      appVersion: app.getVersion(),
      startedAt: mainProcessStartedAt,
    });
  } catch (error) {
    await appendLogEvent({
      level: 'error',
      source: 'http-service',
      message: `Failed to start HTTP service: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  await createWindow();
  ensureTray();
  refreshTrayMenu();

  app.on('activate', async () => {
    await showMainWindow();
  });
});

app.on('before-quit', () => {
  isQuitRequested = true;
  void galleryHttpService?.stop();
  galleryHttpService = null;
  tray?.destroy();
  tray = null;
});

app.on('window-all-closed', () => {
  // Service remains active in tray until explicit exit.
});






