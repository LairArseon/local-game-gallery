import { app, BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';

let mainWindow: BrowserWindow | null = null;

function resolveStandaloneWindowIconPath() {
  const iconCandidates = [
    path.join(app.getAppPath(), 'icon', 'standalone-client-icon', 'icon.ico'),
    path.join(app.getAppPath(), 'icon', 'standalone-client-icon', 'icon.png'),
    path.join(app.getAppPath(), 'icon', 'icon.ico'),
    path.join(app.getAppPath(), 'icon', 'icon.png'),
    path.join(process.cwd(), 'icon', 'standalone-client-icon', 'icon.ico'),
    path.join(process.cwd(), 'icon', 'standalone-client-icon', 'icon.png'),
    path.join(process.cwd(), 'icon', 'icon.ico'),
    path.join(process.cwd(), 'icon', 'icon.png'),
  ];

  for (const candidatePath of iconCandidates) {
    if (candidatePath && candidatePath.length && existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return undefined;
}

function resolveStandaloneIndexPath() {
  return path.resolve(__dirname, '..', '..', 'dist-standalone-client', 'index.html');
}

async function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1260,
    height: 820,
    minWidth: 980,
    minHeight: 660,
    show: false,
    autoHideMenuBar: true,
    icon: resolveStandaloneWindowIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const devServerUrl = String(process.env.LGG_STANDALONE_DEV_SERVER_URL ?? '').trim();
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
    return;
  }

  await mainWindow.loadFile(resolveStandaloneIndexPath());
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.localgamegallery.client');
  }

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
