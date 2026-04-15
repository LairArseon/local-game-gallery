import { app, Menu, Tray, nativeImage, shell } from 'electron';
import { existsSync, unlinkSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

type ServiceProbeSnapshot = {
  statusLabel: string;
  endpoint: string;
  detail: string;
  healthy: boolean;
  checkedAt: string;
};

let tray: Tray | null = null;
let webServer: ReturnType<typeof createServer> | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let isQuitting = false;

const trayStartedAt = new Date().toISOString();
const defaultServiceEndpoint = 'http://127.0.0.1:37995';
const defaultWebClientHost = '0.0.0.0';
const defaultWebClientDisplayHost = '127.0.0.1';
const defaultWebClientPort = 4173;
let serviceSnapshot: ServiceProbeSnapshot = {
  statusLabel: 'Checking',
  endpoint: defaultServiceEndpoint,
  detail: 'Waiting for first health check',
  healthy: false,
  checkedAt: trayStartedAt,
};
let webClientBaseUrl = '';

const webClientTrayUserDataPath = path.join(app.getPath('appData'), 'Local Game Gallery Web Client Tray');
app.setPath('userData', webClientTrayUserDataPath);

function normalizeBaseUrl(rawUrl: string) {
  return String(rawUrl ?? '').trim().replace(/\/+$/, '');
}

function resolveServiceEndpoint() {
  const configured = normalizeBaseUrl(String(process.env.LGG_WEB_BACKEND_URL ?? ''));
  return configured || defaultServiceEndpoint;
}

function resolveWebClientUrl() {
  const configured = String(process.env.LGG_WEB_CLIENT_URL ?? '').trim();
  if (configured) {
    return configured;
  }

  return webClientBaseUrl || `http://${defaultWebClientDisplayHost}:${defaultWebClientPort}`;
}

function resolveWebClientHost() {
  const configured = String(process.env.LGG_WEB_HOST ?? '').trim();
  return configured || defaultWebClientHost;
}

function resolveWebClientPort() {
  const configured = Number.parseInt(String(process.env.LGG_WEB_PORT ?? ''), 10);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  return defaultWebClientPort;
}

function canManageStartupAtLogin() {
  return process.platform === 'win32';
}

function resolveLoginItemArgs() {
  const entryScriptPath = String(process.argv[1] ?? '').trim();
  if (!entryScriptPath) {
    return [];
  }

  return [path.resolve(entryScriptPath)];
}

function resolveStartupFolderPath() {
  const appDataPath = String(process.env.APPDATA ?? app.getPath('appData')).trim();
  return path.join(appDataPath, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
}

function resolveStartupShortcutPath() {
  return path.join(resolveStartupFolderPath(), 'Web Client Tray Host.lnk');
}

function resolveStartupShortcutIconPath() {
  const scriptInstallRoot = path.resolve(__dirname, '..', '..');
  const runtimeInstallRoot = path.resolve(path.dirname(process.execPath), '..', '..');
  const iconCandidates = [
    path.join(scriptInstallRoot, 'icon', 'web-client-icon', 'icon.ico'),
    path.join(scriptInstallRoot, 'icon', 'icon.ico'),
    path.join(runtimeInstallRoot, 'icon', 'web-client-icon', 'icon.ico'),
    path.join(runtimeInstallRoot, 'icon', 'icon.ico'),
    path.join(app.getAppPath(), 'icon', 'web-client-icon', 'icon.ico'),
    path.join(app.getAppPath(), 'icon', 'icon.ico'),
    path.join(process.cwd(), 'icon', 'web-client-icon', 'icon.ico'),
    path.join(process.cwd(), 'icon', 'icon.ico'),
    process.execPath,
  ];

  return iconCandidates.find((candidate) => existsSync(candidate)) ?? process.execPath;
}

function clearLegacyLoginItemAutostart() {
  app.setLoginItemSettings({
    openAtLogin: false,
    path: process.execPath,
    args: resolveLoginItemArgs(),
  });
}

function isStartWithWindowsEnabled() {
  if (!canManageStartupAtLogin()) {
    return false;
  }

  return existsSync(resolveStartupShortcutPath());
}

function setStartWithWindowsEnabled(enabled: boolean) {
  if (!canManageStartupAtLogin()) {
    return;
  }

  const startupShortcutPath = resolveStartupShortcutPath();
  const scriptEntryPath = resolveLoginItemArgs()[0] ?? '';
  clearLegacyLoginItemAutostart();

  if (enabled) {
    if (!scriptEntryPath) {
      refreshTray();
      return;
    }

    shell.writeShortcutLink(startupShortcutPath, 'create', {
      target: process.execPath,
      args: `"${scriptEntryPath}"`,
      cwd: path.dirname(process.execPath),
      description: 'Local Game Gallery Web Client Tray Host',
      icon: resolveStartupShortcutIconPath(),
      iconIndex: 0,
      appUserModelId: 'com.localgamegallery.web-client',
    });
  } else if (existsSync(startupShortcutPath)) {
    unlinkSync(startupShortcutPath);
  }

  refreshTray();
}

function resolveBundledWebClientRoot() {
  return path.resolve(__dirname, '..', '..', 'dist-web-client');
}

function resolveBundledWebClientIndexPath() {
  return path.join(resolveBundledWebClientRoot(), 'index.html');
}

function resolveTrayIcon() {
  const scriptInstallRoot = path.resolve(__dirname, '..', '..');
  const runtimeInstallRoot = path.resolve(path.dirname(process.execPath), '..', '..');

  const iconCandidates = [
    path.join(scriptInstallRoot, 'icon', 'web-client-icon', 'icon.ico'),
    path.join(scriptInstallRoot, 'icon', 'web-client-icon', 'icon.png'),
    path.join(scriptInstallRoot, 'icon', 'icon.ico'),
    path.join(scriptInstallRoot, 'icon', 'icon.png'),
    path.join(runtimeInstallRoot, 'icon', 'web-client-icon', 'icon.ico'),
    path.join(runtimeInstallRoot, 'icon', 'web-client-icon', 'icon.png'),
    path.join(runtimeInstallRoot, 'icon', 'icon.ico'),
    path.join(runtimeInstallRoot, 'icon', 'icon.png'),
    path.join(app.getAppPath(), 'icon', 'web-client-icon', 'icon.ico'),
    path.join(app.getAppPath(), 'icon', 'web-client-icon', 'icon.png'),
    path.join(app.getAppPath(), 'icon', 'icon.ico'),
    path.join(app.getAppPath(), 'icon', 'icon.png'),
    path.join(process.cwd(), 'icon', 'web-client-icon', 'icon.ico'),
    path.join(process.cwd(), 'icon', 'web-client-icon', 'icon.png'),
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

async function probeServiceSnapshot() {
  const serviceEndpoint = resolveServiceEndpoint();

  try {
    const [versionResponse, healthResponse] = await Promise.all([
      fetch(`${serviceEndpoint}/api/version`),
      fetch(`${serviceEndpoint}/api/health`),
    ]);

    if (!versionResponse.ok || !healthResponse.ok) {
      throw new Error(`Health check failed (version=${versionResponse.status}, health=${healthResponse.status}).`);
    }

    const versionPayload = await versionResponse.json() as {
      ok?: boolean;
      data?: {
        apiVersion?: string;
      };
    };

    const apiVersion = String(versionPayload.data?.apiVersion ?? 'unknown').trim();
    const compatible = apiVersion.toLowerCase().startsWith('http-v');

    serviceSnapshot = {
      statusLabel: compatible ? 'Running' : 'Incompatible',
      endpoint: serviceEndpoint,
      detail: compatible ? `API ${apiVersion}` : `Unexpected API version ${apiVersion}`,
      healthy: compatible,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    serviceSnapshot = {
      statusLabel: 'Unreachable',
      endpoint: serviceEndpoint,
      detail: message,
      healthy: false,
      checkedAt: new Date().toISOString(),
    };
  }
}

function buildTrayMenu() {
  const startedAtLabel = new Date(trayStartedAt).toLocaleString();
  const checkedAtLabel = new Date(serviceSnapshot.checkedAt).toLocaleTimeString();
  const startupSupported = canManageStartupAtLogin();
  const startupEnabled = startupSupported && isStartWithWindowsEnabled();

  return Menu.buildFromTemplate([
    { label: 'Local Game Gallery Web Client', enabled: false },
    { type: 'separator' },
    {
      label: 'Open Web Client in Browser',
      click: () => {
        void shell.openExternal(resolveWebClientUrl());
      },
    },
    { label: `Web URL: ${resolveWebClientUrl()}`, enabled: false },
    { type: 'separator' },
    { label: `Service status: ${serviceSnapshot.statusLabel}`, enabled: false },
    { label: `Service endpoint: ${serviceSnapshot.endpoint}`, enabled: false },
    { label: `Detail: ${serviceSnapshot.detail}`, enabled: false },
    { label: `Checked: ${checkedAtLabel}`, enabled: false },
    { label: `Started: ${startedAtLabel}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Refresh Service Status',
      click: () => {
        void refreshServiceSnapshot();
      },
    },
    {
      label: 'Open Service Health',
      enabled: serviceSnapshot.healthy,
      click: () => {
        void shell.openExternal(`${serviceSnapshot.endpoint}/api/health`);
      },
    },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      enabled: startupSupported,
      checked: startupEnabled,
      click: () => {
        setStartWithWindowsEnabled(!isStartWithWindowsEnabled());
      },
    },
    { type: 'separator' },
    {
      label: 'Exit Web Client',
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

  tray.setToolTip(`LGG Web Client ${resolveWebClientUrl()} (${serviceSnapshot.statusLabel})`);
  tray.setContextMenu(buildTrayMenu());
}

async function refreshServiceSnapshot() {
  await probeServiceSnapshot();
  refreshTray();
}

function requestQuit() {
  if (isQuitting) {
    return;
  }

  isQuitting = true;
  void shutdownAndExit();
}

function ensurePathWithinRoot(rootPath: string, requestedPath: string) {
  const relative = path.relative(rootPath, requestedPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveContentType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.ico':
      return 'image/x-icon';
    default:
      return 'application/octet-stream';
  }
}

async function proxyApiRequest(request: IncomingMessage, response: ServerResponse, requestUrl: URL) {
  const endpoint = resolveServiceEndpoint();
  const targetUrl = `${endpoint}${requestUrl.pathname}${requestUrl.search}`;

  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === 'string') {
      headers[name] = value;
    } else if (Array.isArray(value)) {
      headers[name] = value.join(',');
    }
  }

  delete headers.host;
  delete headers['content-length'];

  let bodyBuffer: Buffer | undefined;
  if ((request.method ?? 'GET').toUpperCase() !== 'GET' && (request.method ?? 'GET').toUpperCase() !== 'HEAD') {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    bodyBuffer = Buffer.concat(chunks);
  }

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: bodyBuffer ? new Uint8Array(bodyBuffer) : undefined,
  });

  response.statusCode = upstream.status;
  upstream.headers.forEach((value, name) => {
    if (name.toLowerCase() === 'transfer-encoding') {
      return;
    }

    response.setHeader(name, value);
  });

  const payload = Buffer.from(await upstream.arrayBuffer());
  response.end(payload);
}

async function serveStaticFile(response: ServerResponse, filePath: string) {
  const payload = await readFile(filePath);
  response.statusCode = 200;
  response.setHeader('Content-Type', resolveContentType(filePath));
  response.end(payload);
}

async function handleWebRequest(request: IncomingMessage, response: ServerResponse) {
  const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');

  if (requestUrl.pathname.startsWith('/api/')) {
    await proxyApiRequest(request, response, requestUrl);
    return;
  }

  const rootPath = resolveBundledWebClientRoot();
  const indexPath = resolveBundledWebClientIndexPath();

  let resolvedPath = indexPath;
  const requestedPath = decodeURIComponent(requestUrl.pathname || '/');
  if (requestedPath !== '/') {
    const candidate = path.resolve(rootPath, `.${requestedPath}`);
    if (!ensurePathWithinRoot(rootPath, candidate)) {
      response.statusCode = 403;
      response.end('Forbidden');
      return;
    }

    try {
      const candidateStat = await stat(candidate);
      if (candidateStat.isFile()) {
        resolvedPath = candidate;
      }
    } catch {
      resolvedPath = indexPath;
    }
  }

  await serveStaticFile(response, resolvedPath);
}

async function startWebServer() {
  if (webServer) {
    return;
  }

  const indexPath = resolveBundledWebClientIndexPath();
  if (!existsSync(indexPath)) {
    throw new Error('Web client build missing. Run npm run build:web-client before npm run start:web-client.');
  }

  const host = resolveWebClientHost();
  const port = resolveWebClientPort();
  const displayHost = host === '0.0.0.0' ? defaultWebClientDisplayHost : host;

  webServer = createServer((request, response) => {
    void handleWebRequest(request, response).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      response.statusCode = 500;
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.end(`Web client server error: ${message}`);
    });
  });

  await new Promise<void>((resolve, reject) => {
    if (!webServer) {
      reject(new Error('Web server not initialized.'));
      return;
    }

    webServer.once('error', (error) => {
      reject(error);
    });

    webServer.listen(port, host, () => {
      resolve();
    });
  });

  webClientBaseUrl = `http://${displayHost}:${port}`;
  console.log(`[web-client] serving at ${webClientBaseUrl}`);
}

async function stopWebServer() {
  if (!webServer) {
    return;
  }

  const runningServer = webServer;
  webServer = null;

  await new Promise<void>((resolve) => {
    runningServer.close(() => {
      resolve();
    });
  });
}

async function shutdownAndExit() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  await stopWebServer().catch(() => undefined);

  tray?.destroy();
  tray = null;

  app.exit(0);
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.localgamegallery.web-client');
  }

  await startWebServer();

  tray = new Tray(resolveTrayIcon());
  tray.on('click', () => {
    void shell.openExternal(resolveWebClientUrl());
  });

  await refreshServiceSnapshot();

  pollTimer = setInterval(() => {
    void refreshServiceSnapshot();
  }, 10_000);
  pollTimer.unref();

  refreshTray();
}).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[web-client-tray] failed to start: ${message}`);
  process.exit(1);
});

app.on('window-all-closed', () => {
  // Tray-only app: no window lifecycle handling needed.
});

app.on('before-quit', (event) => {
  if (isQuitting) {
    return;
  }

  event.preventDefault();
  requestQuit();
});

process.once('SIGINT', () => {
  requestQuit();
});

process.once('SIGTERM', () => {
  requestQuit();
});