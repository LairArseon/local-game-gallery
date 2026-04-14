import { app, Menu, Tray, nativeImage, shell } from 'electron';
import path from 'node:path';
import process from 'node:process';
import { appendLogEvent } from './logger';
import { startGalleryHttpService, type GalleryHttpService } from './service';

let tray: Tray | null = null;
let galleryHttpService: GalleryHttpService | null = null;
let isQuitting = false;
const serviceTrayStartedAt = new Date().toISOString();

const serviceTrayUserDataPath = path.join(app.getPath('appData'), 'Local Game Gallery Service Tray');
app.setPath('userData', serviceTrayUserDataPath);

function resolveWebClientUrl() {
  const configured = String(process.env.LGG_WEB_CLIENT_URL ?? '').trim();
  if (configured) {
    return configured;
  }

  return 'http://127.0.0.1:4173';
}

function resolveTrayIcon() {
  const scriptInstallRoot = path.resolve(__dirname, '..', '..');
  const runtimeInstallRoot = path.resolve(path.dirname(process.execPath), '..', '..');

  const iconCandidates = [
    path.join(scriptInstallRoot, 'icon', 'service-icon', 'icon.ico'),
    path.join(scriptInstallRoot, 'icon', 'service-icon', 'icon.png'),
    path.join(scriptInstallRoot, 'icon', 'icon.ico'),
    path.join(scriptInstallRoot, 'icon', 'icon.png'),
    path.join(runtimeInstallRoot, 'icon', 'service-icon', 'icon.ico'),
    path.join(runtimeInstallRoot, 'icon', 'service-icon', 'icon.png'),
    path.join(runtimeInstallRoot, 'icon', 'icon.ico'),
    path.join(runtimeInstallRoot, 'icon', 'icon.png'),
    path.join(app.getAppPath(), 'icon', 'service-icon', 'icon.ico'),
    path.join(app.getAppPath(), 'icon', 'service-icon', 'icon.png'),
    path.join(app.getAppPath(), 'icon', 'icon.ico'),
    path.join(app.getAppPath(), 'icon', 'icon.png'),
    path.join(process.cwd(), 'icon', 'service-icon', 'icon.ico'),
    path.join(process.cwd(), 'icon', 'service-icon', 'icon.png'),
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

function getServiceSnapshot() {
  if (galleryHttpService) {
    const health = galleryHttpService.getHealth();
    return {
      statusLabel: health.status === 'ok' ? 'Running' : health.status,
      endpoint: health.port > 0 ? `http://${health.host}:${health.port}` : 'Unavailable',
      healthy: health.status === 'ok',
    };
  }

  return {
    statusLabel: 'Stopped',
    endpoint: 'Unavailable',
    healthy: false,
  };
}

function buildTrayMenu() {
  const snapshot = getServiceSnapshot();
  const startedAtLabel = new Date(serviceTrayStartedAt).toLocaleString();

  return Menu.buildFromTemplate([
    { label: 'Local Game Gallery Service', enabled: false },
    { type: 'separator' },
    { label: `Service status: ${snapshot.statusLabel}`, enabled: false },
    { label: `Endpoint: ${snapshot.endpoint}`, enabled: false },
    { label: `Started: ${startedAtLabel}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Open Web Client',
      click: () => {
        void shell.openExternal(resolveWebClientUrl());
      },
    },
    {
      label: 'Open Service Health',
      enabled: snapshot.healthy,
      click: () => {
        if (!galleryHttpService) {
          return;
        }

        const health = galleryHttpService.getHealth();
        if (health.port <= 0) {
          return;
        }

        void shell.openExternal(`http://${health.host}:${health.port}/api/health`);
      },
    },
    { type: 'separator' },
    {
      label: 'Exit and stop service',
      click: () => {
        requestQuit();
      },
    },
  ]);
}

function refreshTray() {
  if (!tray) {
    return;
  }

  const snapshot = getServiceSnapshot();
  tray.setToolTip(`Local Game Gallery Service (${snapshot.statusLabel})`);
  tray.setContextMenu(buildTrayMenu());
}

async function stopServiceIfRunning() {
  if (!galleryHttpService) {
    return;
  }

  const runningService = galleryHttpService;
  galleryHttpService = null;

  await runningService.stop().catch(() => undefined);
}

function requestQuit() {
  if (isQuitting) {
    return;
  }

  isQuitting = true;
  app.quit();
}

async function startService() {
  const appVersion = String(
    process.env.LGG_SERVICE_BUILD
      ?? process.env.npm_package_version
      ?? '1.0.0',
  ).trim() || '1.0.0';

  galleryHttpService = await startGalleryHttpService({
    appVersion,
    startedAt: serviceTrayStartedAt,
  });

  const health = galleryHttpService.getHealth();
  console.log(`[gallery-service] listening on http://${health.host}:${health.port}`);
  refreshTray();
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.localgamegallery.service');
  }

  tray = new Tray(resolveTrayIcon());
  tray.on('click', () => {
    tray?.popUpContextMenu();
  });
  refreshTray();

  try {
    await startService();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[gallery-service] failed to start: ${message}`);
    await appendLogEvent({
      level: 'error',
      source: 'service-tray',
      message: `Failed to start standalone service tray runtime: ${message}`,
    }).catch(() => undefined);
    requestQuit();
  }
}).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[gallery-service] tray bootstrap failed: ${message}`);
  process.exit(1);
});

app.on('before-quit', (event) => {
  if (!galleryHttpService) {
    return;
  }

  event.preventDefault();
  void stopServiceIfRunning().finally(() => {
    tray?.destroy();
    tray = null;
    galleryHttpService = null;
    app.exit(0);
  });
});

process.once('SIGINT', () => {
  requestQuit();
});

process.once('SIGTERM', () => {
  requestQuit();
});