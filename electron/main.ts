/**
 * Electron main process bootstrap, IPC wiring, and desktop integrations.
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import type { OpenDialogOptions } from 'electron';
import { access, appendFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { loadConfig, saveConfig } from './config';
import { appendLogEvent, clearLogContents, openLogFolder, readLogContents } from './logger';
import { importDroppedGameMedia, readGameMetadata, removeScreenshot, reorderScreenshots, saveGameMetadata } from './game-library';
import { scanGames } from './scanner';
import type {
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
  SaveGameMetadataPayload,
  VersionContextMenuPayload,
} from '../src/types';

let mainWindow: BrowserWindow | null = null;

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

async function createWindow() {
  const config = await loadConfig();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#10131b',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  applyMenuBarVisibility(mainWindow, true);

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    const key = input.key.toLowerCase();
    const isToggleDevtools = key === 'f12' || ((input.control || input.meta) && input.shift && key === 'i');
    if (!isToggleDevtools) {
      return;
    }

    mainWindow?.webContents.toggleDevTools();
  });

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

ipcMain.handle('gallery:save-config', async (_event, config: GalleryConfig) => saveConfig(config));

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

ipcMain.handle('gallery:scan-games', async () => {
  const config = await loadConfig();
  return scanGames(config);
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
  const metadata = await readGameMetadata(
    payload.gamePath,
    payload.gameName,
    payload.versions.map((version) => ({ ...version, hasNfo: false })),
  );

  const storedExecutable = metadata.launchExecutable.trim();
  if (storedExecutable) {
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

  const searchFolders = payload.versions.map((version) => version.path);
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
      message: 'No executable files found in game version folders.',
    };
  }

  let selectedExecutable = discoveredExecutables[0];
  const window = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;

  if (discoveredExecutables.length > 1) {
    const relativeOptions = discoveredExecutables.map((candidate, index) => `${index + 1}. ${path.relative(payload.gamePath, candidate)}`);
    const selectedIndexButtons = discoveredExecutables.map((candidate, index) => {
      const label = `${index + 1}) ${path.basename(candidate)}`;
      return label.length > 38 ? `${label.slice(0, 35)}...` : label;
    });

    const selection = window
      ? await dialog.showMessageBox(window, {
        type: 'question',
        title: 'Choose Executable',
        message: 'Multiple executable files were found for this game.',
        detail: `Select which one should be used by default:\n\n${relativeOptions.join('\n')}`,
        buttons: [...selectedIndexButtons, 'Cancel'],
        cancelId: discoveredExecutables.length,
        defaultId: 0,
        noLink: true,
      })
      : await dialog.showMessageBox({
      type: 'question',
      title: 'Choose Executable',
      message: 'Multiple executable files were found for this game.',
      detail: `Select which one should be used by default:\n\n${relativeOptions.join('\n')}`,
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

  metadata.launchExecutable = toStoredExecutablePath(payload.gamePath, selectedExecutable);
  await saveGameMetadata({
    gamePath: payload.gamePath,
    title: payload.gameName,
    metadata,
  });

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

  const menu = Menu.buildFromTemplate([
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
  ]);

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

app.whenReady().then(async () => {
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
