/**
 * Web client adapter backed by the desktop-hosted HTTP service.
 *
 * New to this project: this adapter powers browser/mobile gallery workflows
 * over LAN/Tailscale while safely disabling host-desktop-only operations.
 */
import type {
  AppIconInspectPayload,
  AppIconInspectResult,
  GalleryConfig,
  GameSummary,
  GameContextMenuAction,
  GameContextMenuPayload,
  ImportDroppedGameMediaPayload,
  ImportGameMediaPayload,
  LogEventPayload,
  OpenFolderPayload,
  OpenFolderResult,
  PlayGamePayload,
  PlayGameResult,
  RemoveScreenshotPayload,
  ReorderScreenshotsPayload,
  SaveExtraDownloadPayload,
  SaveExtraDownloadResult,
  SaveVersionDownloadPayload,
  SaveVersionDownloadResult,
  SaveGameMetadataPayload,
  ScanRequestOptions,
  ScanResult,
  ServiceApiVersionInfo,
  ServiceCapabilities,
  ServiceHealthStatus,
  StageDroppedAppIconPayload,
  VaultContextMenuAction,
  VaultContextMenuPayload,
  VersionContextMenuAction,
  VersionContextMenuPayload,
} from '../../types';
import type { GalleryClient } from '../contracts';

type ApiEnvelope<T> = {
  ok: true;
  data: T;
} | {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

type UploadMediaFilePayload = {
  name: string;
  mimeType?: string;
  dataBase64: string;
};

type UploadMediaRequestPayload = {
  gamePath: string;
  target: 'poster' | 'card' | 'background' | 'screenshot';
  files: UploadMediaFilePayload[];
};

export type BrowserMediaUploadProgress = {
  completed: number;
  total: number;
  phase: 'preparing' | 'uploading' | 'finalizing';
};

type BrowserContextMenuItem = {
  type?: 'item';
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

type BrowserContextMenuEntry = BrowserContextMenuItem | {
  type: 'separator';
};

export type WebServiceProbeResult = {
  baseUrl: string;
  reachable: boolean;
  compatible: boolean;
  reason: string | null;
  apiVersion: ServiceApiVersionInfo | null;
  capabilities: ServiceCapabilities | null;
  health: ServiceHealthStatus | null;
};

export type WebServiceDiscoveryResult = {
  activeBackend: WebServiceProbeResult | null;
  attempts: WebServiceProbeResult[];
  suggestedUrl: string;
};

const defaultServicePort = 37995;
const configuredServiceBaseUrl = String(import.meta.env.VITE_GALLERY_SERVICE_URL ?? '').trim();
const fallbackServiceBaseUrl = `http://127.0.0.1:${defaultServicePort}`;
const localhostServiceBaseUrl = `http://localhost:${defaultServicePort}`;
const serviceBaseUrlStorageKey = 'lgg.web.service-base-url.v1';
const compatibleApiPrefix = 'http-v';
let suppressLogRequestsUntil = 0;
let cachedServiceCapabilities: ServiceCapabilities | null = null;
const gameContextMenuListeners = new Set<(payload: GameContextMenuAction) => void>();
const versionContextMenuListeners = new Set<(payload: VersionContextMenuAction) => void>();
const vaultContextMenuListeners = new Set<(payload: VaultContextMenuAction) => void>();
let disposeActiveBrowserContextMenu: (() => void) | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function pickBrowserImageFiles(allowMultiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/bmp';
    input.multiple = allowMultiple;

    let settled = false;
    let didBlurAfterOpen = false;
    let focusFallbackTimer: number | null = null;
    const settle = (files: File[]) => {
      if (settled) {
        return;
      }

      settled = true;
      if (focusFallbackTimer !== null) {
        window.clearTimeout(focusFallbackTimer);
        focusFallbackTimer = null;
      }
      window.removeEventListener('blur', handleWindowBlur, true);
      window.removeEventListener('focus', handleWindowFocus, true);
      resolve(files);
    };

    const handleWindowBlur = () => {
      // Native file dialogs usually move focus away from the window.
      didBlurAfterOpen = true;
    };

    const handleWindowFocus = () => {
      // Only settle on focus if the picker actually stole focus first.
      if (!didBlurAfterOpen) {
        return;
      }

      // Some Chromium/Electron environments do not emit input cancel/change on dialog close.
      // Delay fallback slightly so normal change events win when files were selected.
      if (focusFallbackTimer !== null) {
        window.clearTimeout(focusFallbackTimer);
      }

      focusFallbackTimer = window.setTimeout(() => {
        const files = Array.from(input.files ?? []);
        settle(files);
      }, 220);
    };

    input.addEventListener('change', () => {
      settle(Array.from(input.files ?? []));
    }, { once: true });

    input.addEventListener('cancel', () => {
      settle([]);
    }, { once: true });

    window.addEventListener('blur', handleWindowBlur, true);
    window.addEventListener('focus', handleWindowFocus, true);

    input.click();
  });
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, '');
}

function getStoredServiceBaseUrl() {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return normalizeBaseUrl(String(window.localStorage.getItem(serviceBaseUrlStorageKey) ?? ''));
  } catch {
    return '';
  }
}

export function rememberServiceBaseUrl(baseUrl: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const normalized = normalizeBaseUrl(String(baseUrl ?? ''));
  if (!normalized) {
    return;
  }

  try {
    window.localStorage.setItem(serviceBaseUrlStorageKey, normalized);
  } catch {
    // Persistence is best-effort only.
  }
}

function isLoopbackHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized === '[::1]';
}

function buildServiceBaseUrls() {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const addCandidate = (candidate: string | undefined) => {
    const normalized = normalizeBaseUrl(String(candidate ?? ''));
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    candidates.push(normalized);
  };

  addCandidate(getStoredServiceBaseUrl());

  if (typeof window !== 'undefined') {
    addCandidate(configuredServiceBaseUrl);

    const hasHttpLocation = window.location.protocol === 'http:' || window.location.protocol === 'https:';
    if (hasHttpLocation && window.location.hostname) {
      const currentHostBaseUrl = `${window.location.protocol}//${window.location.hostname}:${defaultServicePort}`;
      addCandidate(currentHostBaseUrl);

      if (isLoopbackHost(window.location.hostname)) {
        addCandidate(localhostServiceBaseUrl);
        addCandidate(fallbackServiceBaseUrl);
      }
    } else {
      addCandidate(localhostServiceBaseUrl);
      addCandidate(fallbackServiceBaseUrl);
    }
  } else {
    addCandidate(configuredServiceBaseUrl);
    addCandidate(fallbackServiceBaseUrl);
  }

  return candidates;
}

export function resolvePreferredServiceBaseUrl() {
  return buildServiceBaseUrls()[0] ?? fallbackServiceBaseUrl;
}

async function requestApiFromBase<T>(baseUrl: string, routePath: string, init?: RequestInit): Promise<T> {
  const hasBody = Boolean(init?.body);
  const headers = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(init?.headers ?? {}),
  };

  const response = await fetch(`${baseUrl}${routePath}`, {
    ...init,
    headers,
  });

  const responseText = await response.text();
  let payload: ApiEnvelope<T> | null = null;
  if (responseText) {
    try {
      payload = JSON.parse(responseText) as ApiEnvelope<T>;
    } catch {
      throw new Error(`Service at ${baseUrl} returned a non-JSON response.`);
    }
  }

  if (!response.ok) {
    if (payload && !payload.ok) {
      throw new Error(payload.error.message);
    }

    throw new Error(`Service request failed with status ${response.status}.`);
  }

  if (!payload || !payload.ok) {
    throw new Error('Service returned an invalid response payload.');
  }

  return payload.data;
}

export async function probeServiceBaseUrl(rawBaseUrl: string): Promise<WebServiceProbeResult> {
  const baseUrl = normalizeBaseUrl(String(rawBaseUrl ?? ''));
  if (!baseUrl) {
    return {
      baseUrl,
      reachable: false,
      compatible: false,
      reason: 'Backend URL is required.',
      apiVersion: null,
      capabilities: null,
      health: null,
    };
  }

  try {
    const [apiVersion, capabilities, health] = await Promise.all([
      requestApiFromBase<ServiceApiVersionInfo>(baseUrl, '/api/version'),
      requestApiFromBase<ServiceCapabilities>(baseUrl, '/api/capabilities'),
      requestApiFromBase<ServiceHealthStatus>(baseUrl, '/api/health'),
    ]);

    const compatible = apiVersion.apiVersion.toLowerCase().startsWith(compatibleApiPrefix);

    return {
      baseUrl,
      reachable: true,
      compatible,
      reason: compatible ? null : `Incompatible API version (${apiVersion.apiVersion}).`,
      apiVersion,
      capabilities,
      health,
    };
  } catch (error) {
    return {
      baseUrl,
      reachable: false,
      compatible: false,
      reason: error instanceof Error ? error.message : 'Unable to contact backend.',
      apiVersion: null,
      capabilities: null,
      health: null,
    };
  }
}

export async function discoverCompatibleServiceBaseUrl(): Promise<WebServiceDiscoveryResult> {
  const candidates = buildServiceBaseUrls();
  const attempts: WebServiceProbeResult[] = [];

  for (const candidate of candidates) {
    const result = await probeServiceBaseUrl(candidate);
    attempts.push(result);

    if (result.compatible) {
      rememberServiceBaseUrl(result.baseUrl);
      return {
        activeBackend: result,
        attempts,
        suggestedUrl: result.baseUrl,
      };
    }
  }

  return {
    activeBackend: null,
    attempts,
    suggestedUrl: candidates[0] ?? fallbackServiceBaseUrl,
  };
}

async function requestApi<T>(routePath: string, init?: RequestInit): Promise<T> {
  const attemptedUrls: string[] = [];
  let lastErrorMessage = '';

  for (const baseUrl of buildServiceBaseUrls()) {
    attemptedUrls.push(baseUrl);

    try {
      return await requestApiFromBase<T>(baseUrl, routePath, init);
    } catch (error) {
      lastErrorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(
    `Could not reach gallery service (${routePath}). Tried: ${attemptedUrls.join(', ')}. `
    + `Last error: ${lastErrorMessage || 'none'}. `
    + `Make sure the desktop app is running and port ${defaultServicePort} is reachable from this browser.`,
  );
}

function unsupportedOperation<T>(methodName: string, detail?: string): Promise<T> {
  return Promise.reject(new Error(detail ?? `Web client operation not supported: ${methodName}`));
}

function unsupportedOpenFolderResult(): OpenFolderResult {
  return {
    opened: false,
    message: 'Opening folders is only available on the host desktop app.',
  };
}

function unsupportedPlayResult(): PlayGameResult {
  return {
    launched: false,
    executablePath: null,
    message: 'Launching games is only available on the host desktop app.',
  };
}

function notifyGameContextMenu(payload: GameContextMenuAction) {
  for (const listener of gameContextMenuListeners) {
    listener(payload);
  }
}

function notifyVersionContextMenu(payload: VersionContextMenuAction) {
  for (const listener of versionContextMenuListeners) {
    listener(payload);
  }
}

function notifyVaultContextMenu(payload: VaultContextMenuAction) {
  for (const listener of vaultContextMenuListeners) {
    listener(payload);
  }
}

function closeBrowserContextMenu() {
  if (!disposeActiveBrowserContextMenu) {
    return;
  }

  disposeActiveBrowserContextMenu();
  disposeActiveBrowserContextMenu = null;
}

function normalizeContextMenuEntries(entries: BrowserContextMenuEntry[]) {
  const normalizedEntries: BrowserContextMenuEntry[] = [];

  for (const entry of entries) {
    if (entry.type === 'separator') {
      if (!normalizedEntries.length) {
        continue;
      }

      const previousEntry = normalizedEntries[normalizedEntries.length - 1];
      if (previousEntry?.type === 'separator') {
        continue;
      }
    }

    normalizedEntries.push(entry);
  }

  while (normalizedEntries.length && normalizedEntries[normalizedEntries.length - 1]?.type === 'separator') {
    normalizedEntries.pop();
  }

  return normalizedEntries;
}

function openBrowserContextMenu(
  entries: BrowserContextMenuEntry[],
  anchorX?: number,
  anchorY?: number,
) {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !entries.length) {
    return;
  }

  const menuEntries = normalizeContextMenuEntries(entries);
  if (!menuEntries.length) {
    return;
  }

  closeBrowserContextMenu();

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.setAttribute('role', 'menu');

  for (const entry of menuEntries) {
    if (entry.type === 'separator') {
      const separator = document.createElement('div');
      separator.className = 'context-menu__separator';
      separator.setAttribute('role', 'separator');
      menu.appendChild(separator);
      continue;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = [
      'context-menu__item',
      entry.danger ? 'context-menu__item--danger' : '',
      entry.disabled ? 'context-menu__item--disabled' : '',
    ].filter(Boolean).join(' ');
    button.textContent = entry.label;
    button.disabled = Boolean(entry.disabled);

    if (!entry.disabled) {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeBrowserContextMenu();
        entry.onSelect();
      });
    }

    menu.appendChild(button);
  }

  menu.addEventListener('mousedown', (event) => {
    event.stopPropagation();
  });
  menu.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  document.body.appendChild(menu);

  const menuRect = menu.getBoundingClientRect();
  const margin = 8;
  const preferredX = Number.isFinite(anchorX) ? Number(anchorX) : window.innerWidth / 2;
  const preferredY = Number.isFinite(anchorY) ? Number(anchorY) : window.innerHeight / 2;
  const clampedX = Math.min(
    Math.max(margin, preferredX),
    Math.max(margin, window.innerWidth - menuRect.width - margin),
  );
  const clampedY = Math.min(
    Math.max(margin, preferredY),
    Math.max(margin, window.innerHeight - menuRect.height - margin),
  );
  menu.style.left = `${Math.round(clampedX)}px`;
  menu.style.top = `${Math.round(clampedY)}px`;

  const handlePointerDown = (event: MouseEvent) => {
    const target = event.target;
    if (target instanceof Node && menu.contains(target)) {
      return;
    }

    closeBrowserContextMenu();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      closeBrowserContextMenu();
    }
  };

  const handleViewportChange = () => {
    closeBrowserContextMenu();
  };

  window.addEventListener('mousedown', handlePointerDown, true);
  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('resize', handleViewportChange, true);
  window.addEventListener('scroll', handleViewportChange, true);

  disposeActiveBrowserContextMenu = () => {
    window.removeEventListener('mousedown', handlePointerDown, true);
    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('resize', handleViewportChange, true);
    window.removeEventListener('scroll', handleViewportChange, true);
    menu.remove();
  };
}

function promptContextAction<TAction extends string>(title: string, options: Array<{ action: TAction; label: string }>) {
  if (typeof window === 'undefined' || !options.length) {
    return null;
  }

  const optionsText = options
    .map((option, index) => `${index + 1}. ${option.label}`)
    .join('\n');

  const selectedRaw = window.prompt(`${title}\n\n${optionsText}\n\nEnter number (or cancel):`, '1');
  if (!selectedRaw) {
    return null;
  }

  const selectedIndex = Number.parseInt(selectedRaw.trim(), 10) - 1;
  if (!Number.isFinite(selectedIndex) || selectedIndex < 0 || selectedIndex >= options.length) {
    return null;
  }

  return options[selectedIndex]?.action ?? null;
}

async function uploadBrowserMediaFiles(
  payload: ImportGameMediaPayload,
  files: File[],
  onProgress?: (progress: BrowserMediaUploadProgress) => void,
) {
  if (!files.length) {
    onProgress?.({ completed: 0, total: 0, phase: 'finalizing' });
    return;
  }

  if (payload.target === 'screenshot') {
    const total = files.length;
    let completed = 0;

    onProgress?.({ completed, total, phase: 'preparing' });

    for (const file of files) {
      const encoded: UploadMediaFilePayload = {
        name: file.name,
        mimeType: file.type,
        dataBase64: arrayBufferToBase64(await file.arrayBuffer()),
      };

      onProgress?.({ completed, total, phase: 'uploading' });

      await requestApi<{ importedCount: number }>('/api/media/upload', {
        method: 'POST',
        body: JSON.stringify({
          gamePath: payload.gamePath,
          target: payload.target,
          files: [encoded],
        } satisfies UploadMediaRequestPayload),
      });

      completed += 1;
      onProgress?.({ completed, total, phase: 'uploading' });
    }

    onProgress?.({ completed: total, total, phase: 'finalizing' });
    return;
  }

  const total = 1;
  const firstFile = files[0];
  if (!firstFile) {
    onProgress?.({ completed: 0, total, phase: 'finalizing' });
    return;
  }

  onProgress?.({ completed: 0, total, phase: 'preparing' });
  const encodedFiles: UploadMediaFilePayload[] = [{
    name: firstFile.name,
    mimeType: firstFile.type,
    dataBase64: arrayBufferToBase64(await firstFile.arrayBuffer()),
  }];

  onProgress?.({ completed: 0, total, phase: 'uploading' });
  const requestPayload: UploadMediaRequestPayload = {
    gamePath: payload.gamePath,
    target: payload.target,
    files: encodedFiles,
  };

  await requestApi<{ importedCount: number }>('/api/media/upload', {
    method: 'POST',
    body: JSON.stringify(requestPayload),
  });

  onProgress?.({ completed: 1, total, phase: 'finalizing' });
}

export async function importMediaFromBrowserPickerWithProgress(
  payload: ImportGameMediaPayload,
  onProgress?: (progress: BrowserMediaUploadProgress) => void,
) {
  const allowMultiple = payload.target === 'screenshot';
  const files = await pickBrowserImageFiles(allowMultiple);
  await uploadBrowserMediaFiles(payload, files, onProgress);
}

async function getRuntimeCapabilities() {
  try {
    const capabilities = await requestApi<ServiceCapabilities>('/api/capabilities');
    cachedServiceCapabilities = capabilities;
    return capabilities;
  } catch {
    return cachedServiceCapabilities;
  }
}

export const webClient: GalleryClient = {
  async getAppVersion() {
    const version = await requestApi<ServiceApiVersionInfo>('/api/version');
    return version.serviceBuild;
  },
  async getServiceCapabilities() {
    const capabilities = await requestApi<ServiceCapabilities>('/api/capabilities');
    cachedServiceCapabilities = capabilities;
    return capabilities;
  },
  async getServiceHealth() {
    return requestApi<ServiceHealthStatus>('/api/health');
  },
  async getApiVersion() {
    return requestApi<ServiceApiVersionInfo>('/api/version');
  },
  async getConfig() {
    return requestApi<GalleryConfig>('/api/config');
  },
  async saveConfig(config) {
    return requestApi<GalleryConfig>('/api/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  },
  async pickGamesRoot() {
    const response = await requestApi<{ selectedPath: string | null }>('/api/pick-games-root', {
      method: 'POST',
    });
    return response.selectedPath ?? null;
  },
  async pickMetadataMirrorRoot() {
    const response = await requestApi<{ selectedPath: string | null }>('/api/pick-metadata-mirror-root', {
      method: 'POST',
    });
    return response.selectedPath ?? null;
  },
  async pickAppIconPng() {
    return null;
  },
  async inspectAppIconFile(_payload: AppIconInspectPayload): Promise<AppIconInspectResult> {
    return {
      isValid: false,
      message: 'App icon inspection is only available on the host desktop app.',
      width: 0,
      height: 0,
      willPadToSquare: false,
    };
  },
  async stageDroppedAppIcon(_payload: StageDroppedAppIconPayload) {
    return unsupportedOperation<string>('stageDroppedAppIcon');
  },
  async applyRuntimeAppIcon() {
    return {
      applied: false,
      message: 'Runtime icon apply is only available on the host desktop app.',
    };
  },
  async scanGames(options?: ScanRequestOptions) {
    return requestApi<ScanResult>('/api/scan', {
      method: 'POST',
      body: JSON.stringify(options ?? {}),
    });
  },
  async scanGame(gamePath: string) {
    const response = await requestApi<{ game: GameSummary | null }>('/api/scan-game', {
      method: 'POST',
      body: JSON.stringify({ gamePath }),
    });

    return response.game;
  },
  async showGameContextMenu(payload: GameContextMenuPayload) {
    const capabilities = await getRuntimeCapabilities();
    const canLaunchFromClient = capabilities?.supportsLaunch === true;
    const canPlayFromContext = canLaunchFromClient && payload.canPlay !== false;

    const menuEntries: BrowserContextMenuEntry[] = [
      {
        label: 'Open',
        onSelect: () => {
          notifyGameContextMenu({
            action: 'open',
            gamePath: payload.gamePath,
          });
        },
      },
      {
        label: 'Play',
        disabled: !canPlayFromContext,
        onSelect: () => {
          notifyGameContextMenu({
            action: 'play',
            gamePath: payload.gamePath,
          });
        },
      },
      {
        label: 'Open game folder',
        disabled: !canLaunchFromClient,
        onSelect: () => {
          notifyGameContextMenu({
            action: 'open-game-folder',
            gamePath: payload.gamePath,
          });
        },
      },
      { type: 'separator' },
      {
        label: 'Edit Metadata',
        onSelect: () => {
          notifyGameContextMenu({
            action: 'edit-metadata',
            gamePath: payload.gamePath,
          });
        },
      },
      {
        label: 'Manage Pictures',
        onSelect: () => {
          notifyGameContextMenu({
            action: 'manage-pictures',
            gamePath: payload.gamePath,
          });
        },
      },
    ];

    if (payload.isVaultOpen) {
      menuEntries.push({ type: 'separator' });
      menuEntries.push({
        label: payload.isGameVaulted ? 'Remove from vault' : 'Add to vault',
        onSelect: () => {
          notifyGameContextMenu({
            action: payload.isGameVaulted ? 'remove-from-vault' : 'add-to-vault',
            gamePath: payload.gamePath,
          });
        },
      });
    }

    openBrowserContextMenu(menuEntries, payload.anchorX, payload.anchorY);
  },
  onGameContextMenuAction(callback) {
    gameContextMenuListeners.add(callback);
    return () => {
      gameContextMenuListeners.delete(callback);
    };
  },
  async showVersionContextMenu(payload: VersionContextMenuPayload) {
    const selectedAction = promptContextAction(
      `Actions for ${payload.versionName}`,
      [{ action: 'open-version-folder', label: 'Open version folder' }],
    );
    if (!selectedAction) {
      return;
    }

    notifyVersionContextMenu({
      action: selectedAction,
      versionPath: payload.versionPath,
    });
  },
  onVersionContextMenuAction(callback) {
    versionContextMenuListeners.add(callback);
    return () => {
      versionContextMenuListeners.delete(callback);
    };
  },
  async showVaultContextMenu(payload: VaultContextMenuPayload) {
    if (!payload.isVaultOpen) {
      return;
    }

    const menuEntries: BrowserContextMenuEntry[] = [];

    if (payload.hasVaultPin) {
      menuEntries.push({
        label: 'Change vault PIN',
        onSelect: () => {
          notifyVaultContextMenu({ action: 'change-vault-pin' });
        },
      });
      menuEntries.push({ type: 'separator' });
      menuEntries.push({
        label: 'Remove vault PIN',
        danger: true,
        onSelect: () => {
          notifyVaultContextMenu({ action: 'remove-vault-pin' });
        },
      });
    } else {
      menuEntries.push({
        label: 'Add vault PIN',
        onSelect: () => {
          notifyVaultContextMenu({ action: 'add-vault-pin' });
        },
      });
    }

    openBrowserContextMenu(menuEntries, payload.anchorX, payload.anchorY);
  },
  onVaultContextMenuAction(callback) {
    vaultContextMenuListeners.add(callback);
    return () => {
      vaultContextMenuListeners.delete(callback);
    };
  },
  async openFolder(_payload: OpenFolderPayload) {
    try {
      return await requestApi<OpenFolderResult>('/api/open-folder', {
        method: 'POST',
        body: JSON.stringify(_payload),
      });
    } catch {
      return unsupportedOpenFolderResult();
    }
  },
  async logEvent(payload: LogEventPayload) {
    if (Date.now() < suppressLogRequestsUntil) {
      return;
    }

    try {
      await requestApi<{ recorded: boolean }>('/api/log-event', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    } catch {
      // Avoid repeated browser console noise while service is unreachable.
      suppressLogRequestsUntil = Date.now() + 10_000;
      // Logging failures should not break UI flows.
    }
  },
  async getLogContents() {
    const response = await requestApi<{ contents: string }>('/api/logs');
    return response.contents;
  },
  async openLogFolder() {
    return requestApi<OpenFolderResult>('/api/open-log-folder', {
      method: 'POST',
    });
  },
  async clearLogContents() {
    await requestApi<{ cleared: boolean }>('/api/logs', {
      method: 'DELETE',
    });
  },
  async setMenuBarVisibility() {
    // Non-Electron clients have no system menu bar to toggle.
  },
  async saveGameMetadata(payload: SaveGameMetadataPayload) {
    await requestApi<{ saved: boolean }>('/api/metadata', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  async importGameMediaFromDialog(payload: ImportGameMediaPayload) {
    await importMediaFromBrowserPickerWithProgress(payload);
  },
  async importDroppedGameMedia(payload: ImportDroppedGameMediaPayload) {
    // Browser drops do not include trusted filesystem paths, so use picker-based upload.
    if (!payload.filePaths.length) {
      await importMediaFromBrowserPickerWithProgress(payload);
      return;
    }

    throw new Error('Path-based drag import is only available in desktop mode. Use the add media button in browser mode.');
  },
  async playGame(_payload: PlayGamePayload) {
    try {
      return await requestApi<PlayGameResult>('/api/play-game', {
        method: 'POST',
        body: JSON.stringify(_payload),
      });
    } catch {
      return unsupportedPlayResult();
    }
  },
  async reorderScreenshots(payload: ReorderScreenshotsPayload) {
    await requestApi<{ reordered: boolean }>('/api/media/reorder', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  async removeScreenshot(payload: RemoveScreenshotPayload) {
    await requestApi<{ removed: boolean }>('/api/media/remove-screenshot', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  async saveExtraDownload(_payload: SaveExtraDownloadPayload): Promise<SaveExtraDownloadResult> {
    return unsupportedOperation<SaveExtraDownloadResult>(
      'saveExtraDownload',
      'Desktop save dialog is only available on the host desktop app.',
    );
  },
  async saveVersionDownload(_payload: SaveVersionDownloadPayload): Promise<SaveVersionDownloadResult> {
    return unsupportedOperation<SaveVersionDownloadResult>(
      'saveVersionDownload',
      'Desktop save dialog is only available on the host desktop app.',
    );
  },
};
