import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import type { OpenDialogOptions } from 'electron';
import path from 'node:path';
import { loadConfig, saveConfig } from './config';
import { importDroppedGameMedia, saveGameMetadata } from './game-library';
import { scanGames } from './scanner';
import type { GameContextMenuPayload, GalleryConfig, ImportDroppedGameMediaPayload, ImportGameMediaPayload, SaveGameMetadataPayload } from '../src/types';

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#10131b',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
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
