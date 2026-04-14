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

const defaultServicePort = 37995;
const configuredServiceBaseUrl = String(import.meta.env.VITE_GALLERY_SERVICE_URL ?? '').trim();
const fallbackServiceBaseUrl = `http://127.0.0.1:${defaultServicePort}`;
const localhostServiceBaseUrl = `http://localhost:${defaultServicePort}`;
let suppressLogRequestsUntil = 0;
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

    input.addEventListener('change', () => {
      resolve(Array.from(input.files ?? []));
    }, { once: true });

    input.addEventListener('cancel', () => {
      resolve([]);
    }, { once: true });

    input.click();
  });
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, '');
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

async function requestApi<T>(routePath: string, init?: RequestInit): Promise<T> {
  const hasBody = Boolean(init?.body);
  const headers = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(init?.headers ?? {}),
  };

  const attemptedUrls: string[] = [];

  for (const baseUrl of buildServiceBaseUrls()) {
    attemptedUrls.push(baseUrl);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${routePath}`, {
        ...init,
        headers,
      });
    } catch {
      continue;
    }

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

  throw new Error(
    `Could not reach gallery service (${routePath}). Tried: ${attemptedUrls.join(', ')}. `
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

async function uploadBrowserMediaFiles(payload: ImportGameMediaPayload, files: File[]) {
  if (!files.length) {
    return;
  }

  const encodedFiles = await Promise.all(files.map(async (file): Promise<UploadMediaFilePayload> => ({
    name: file.name,
    mimeType: file.type,
    dataBase64: arrayBufferToBase64(await file.arrayBuffer()),
  })));

  const requestPayload: UploadMediaRequestPayload = {
    gamePath: payload.gamePath,
    target: payload.target,
    files: encodedFiles,
  };

  await requestApi<{ importedCount: number }>('/api/media/upload', {
    method: 'POST',
    body: JSON.stringify(requestPayload),
  });
}

async function importMediaFromBrowserPicker(payload: ImportGameMediaPayload) {
  const allowMultiple = payload.target === 'screenshot';
  const files = await pickBrowserImageFiles(allowMultiple);
  await uploadBrowserMediaFiles(payload, files);
}

export const webClient: GalleryClient = {
  async getAppVersion() {
    const version = await requestApi<ServiceApiVersionInfo>('/api/version');
    return version.serviceBuild;
  },
  async getServiceCapabilities() {
    return requestApi<ServiceCapabilities>('/api/capabilities');
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
  async showGameContextMenu(payload: GameContextMenuPayload) {
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
        disabled: true,
        onSelect: () => {},
      },
      {
        label: 'Open game folder',
        disabled: true,
        onSelect: () => {},
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
    return unsupportedOpenFolderResult();
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
    return unsupportedOpenFolderResult();
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
    await importMediaFromBrowserPicker(payload);
  },
  async importDroppedGameMedia(payload: ImportDroppedGameMediaPayload) {
    // Browser drops do not include trusted filesystem paths, so use picker-based upload.
    if (!payload.filePaths.length) {
      await importMediaFromBrowserPicker(payload);
      return;
    }

    throw new Error('Path-based drag import is only available in desktop mode. Use the add media button in browser mode.');
  },
  async playGame(_payload: PlayGamePayload) {
    return unsupportedPlayResult();
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
};
