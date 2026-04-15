import { app, BrowserWindow, nativeImage, type NativeImage } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';

let mainWindow: BrowserWindow | null = null;

function resolveStandaloneWindowIcon(): NativeImage | undefined {
  const scriptInstallRoot = path.resolve(__dirname, '..', '..');
  const runtimeInstallRoot = path.resolve(path.dirname(process.execPath), '..', '..');

  const iconCandidates = [
    path.join(scriptInstallRoot, 'icon', 'standalone-client-icon', 'icon.ico'),
    path.join(scriptInstallRoot, 'icon', 'standalone-client-icon', 'icon.png'),
    path.join(scriptInstallRoot, 'icon', 'icon.ico'),
    path.join(scriptInstallRoot, 'icon', 'icon.png'),
    path.join(runtimeInstallRoot, 'icon', 'standalone-client-icon', 'icon.ico'),
    path.join(runtimeInstallRoot, 'icon', 'standalone-client-icon', 'icon.png'),
    path.join(runtimeInstallRoot, 'icon', 'icon.ico'),
    path.join(runtimeInstallRoot, 'icon', 'icon.png'),
    path.join(process.resourcesPath, 'icon', 'standalone-client-icon', 'icon.ico'),
    path.join(process.resourcesPath, 'icon', 'standalone-client-icon', 'icon.png'),
    path.join(process.resourcesPath, 'icon', 'icon.ico'),
    path.join(process.resourcesPath, 'icon', 'icon.png'),
    path.join(app.getAppPath(), 'icon', 'standalone-client-icon', 'icon.ico'),
    path.join(app.getAppPath(), 'icon', 'standalone-client-icon', 'icon.png'),
    path.join(app.getAppPath(), 'icon', 'icon.ico'),
    path.join(app.getAppPath(), 'icon', 'icon.png'),
    path.join(process.cwd(), 'icon', 'standalone-client-icon', 'icon.ico'),
    path.join(process.cwd(), 'icon', 'standalone-client-icon', 'icon.png'),
    path.join(process.cwd(), 'icon', 'icon.ico'),
    path.join(process.cwd(), 'icon', 'icon.png'),
    process.execPath,
  ];

  for (const candidatePath of iconCandidates) {
    if (!candidatePath) {
      continue;
    }

    const image = nativeImage.createFromPath(candidatePath);
    if (!image.isEmpty()) {
      return image;
    }
  }

  return undefined;
}

function resolveStandaloneIndexCandidates() {
  return [
    path.resolve(__dirname, '..', '..', 'dist-standalone-client', 'index.html'),
    path.resolve(__dirname, '..', '..', '..', 'dist-standalone-client', 'index.html'),
    path.join(app.getAppPath(), 'dist-standalone-client', 'index.html'),
    path.join(process.cwd(), 'dist-standalone-client', 'index.html'),
  ];
}

async function loadStandaloneRenderer(window: BrowserWindow) {
  const indexCandidates = resolveStandaloneIndexCandidates();

  for (const candidatePath of indexCandidates) {
    if (!candidatePath || !existsSync(candidatePath)) {
      continue;
    }

    try {
      await window.loadFile(candidatePath);
      return;
    } catch {
      // Try the next candidate path before failing startup.
    }
  }

  throw new Error('Standalone renderer index.html could not be loaded from any known install path.');
}

async function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return;
  }

  const windowIcon = resolveStandaloneWindowIcon();

  mainWindow = new BrowserWindow({
    width: 1260,
    height: 820,
    minWidth: 980,
    minHeight: 660,
    show: false,
    autoHideMenuBar: true,
    ...(windowIcon ? { icon: windowIcon } : {}),
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
    try {
      await mainWindow.loadURL(devServerUrl);
      return;
    } catch {
      // Fall back to bundled renderer when dev server is unavailable.
    }
  }

  await loadStandaloneRenderer(mainWindow);
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
