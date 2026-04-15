import { contextBridge, ipcRenderer } from 'electron';
import type {
  ApplyRuntimeAppIconPayload,
  ApplyRuntimeAppIconResult,
  AppIconInspectPayload,
  StageDroppedAppIconPayload,
  GameContextMenuPayload,
  GameContextMenuAction,
  AppIconInspectResult,
  GalleryApi,
  GalleryConfig,
  ImportDroppedGameMediaPayload,
  ImportGameMediaPayload,
  LogEventPayload,
  OpenFolderPayload,
  RemoveScreenshotPayload,
  PlayGamePayload,
  ReorderScreenshotsPayload,
  SaveGameMetadataPayload,
  ScanRequestOptions,
  ServiceApiVersionInfo,
  ServiceCapabilities,
  ServiceHealthStatus,
  VaultContextMenuAction,
  VaultContextMenuPayload,
  VersionContextMenuAction,
  VersionContextMenuPayload,
} from '../src/types';

const api: GalleryApi = {
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('gallery:get-app-version'),
  getServiceCapabilities: (): Promise<ServiceCapabilities> => ipcRenderer.invoke('gallery:get-service-capabilities'),
  getServiceHealth: (): Promise<ServiceHealthStatus> => ipcRenderer.invoke('gallery:get-service-health'),
  getApiVersion: (): Promise<ServiceApiVersionInfo> => ipcRenderer.invoke('gallery:get-api-version'),
  getConfig: () => ipcRenderer.invoke('gallery:get-config'),
  saveConfig: (config: GalleryConfig) => ipcRenderer.invoke('gallery:save-config', config),
  pickGamesRoot: () => ipcRenderer.invoke('gallery:pick-games-root'),
  pickMetadataMirrorRoot: () => ipcRenderer.invoke('gallery:pick-metadata-mirror-root'),
  pickAppIconPng: (): Promise<string | null> => ipcRenderer.invoke('gallery:pick-app-icon-png'),
  inspectAppIconFile: (payload: AppIconInspectPayload): Promise<AppIconInspectResult> =>
    ipcRenderer.invoke('gallery:inspect-app-icon-file', payload),
  stageDroppedAppIcon: (payload: StageDroppedAppIconPayload): Promise<string> =>
    ipcRenderer.invoke('gallery:stage-dropped-app-icon', payload),
  applyRuntimeAppIcon: (payload: ApplyRuntimeAppIconPayload): Promise<ApplyRuntimeAppIconResult> =>
    ipcRenderer.invoke('gallery:apply-runtime-app-icon', payload),
  scanGames: (options?: ScanRequestOptions) => ipcRenderer.invoke('gallery:scan-games', options),
  scanGame: (gamePath: string) => ipcRenderer.invoke('gallery:scan-game', { gamePath }),
  showGameContextMenu: (payload: GameContextMenuPayload) => ipcRenderer.invoke('gallery:show-game-context-menu', payload),
  showVersionContextMenu: (payload: VersionContextMenuPayload) => ipcRenderer.invoke('gallery:show-version-context-menu', payload),
  showVaultContextMenu: (payload: VaultContextMenuPayload) => ipcRenderer.invoke('gallery:show-vault-context-menu', payload),
  openFolder: (payload: OpenFolderPayload) => ipcRenderer.invoke('gallery:open-folder', payload),
  logEvent: (payload: LogEventPayload) => ipcRenderer.invoke('gallery:log-event', payload),
  getLogContents: () => ipcRenderer.invoke('gallery:get-log-contents'),
  openLogFolder: () => ipcRenderer.invoke('gallery:open-log-folder'),
  clearLogContents: () => ipcRenderer.invoke('gallery:clear-log-contents'),
  setMenuBarVisibility: (visible: boolean) => ipcRenderer.invoke('gallery:set-menu-bar-visibility', visible),
  saveGameMetadata: (payload: SaveGameMetadataPayload) => ipcRenderer.invoke('gallery:save-game-metadata', payload),
  importGameMediaFromDialog: (payload: ImportGameMediaPayload) => ipcRenderer.invoke('gallery:import-game-media-dialog', payload),
  importDroppedGameMedia: (payload: ImportDroppedGameMediaPayload) => ipcRenderer.invoke('gallery:import-dropped-game-media', payload),
  playGame: (payload: PlayGamePayload) => ipcRenderer.invoke('gallery:play-game', payload),
  reorderScreenshots: (payload: ReorderScreenshotsPayload) => ipcRenderer.invoke('gallery:reorder-screenshots', payload),
  removeScreenshot: (payload: RemoveScreenshotPayload) => ipcRenderer.invoke('gallery:remove-screenshot', payload),
  onGameContextMenuAction: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: GameContextMenuAction) => {
      callback(payload);
    };

    ipcRenderer.on('gallery:context-menu-action', listener);
    return () => {
      ipcRenderer.removeListener('gallery:context-menu-action', listener);
    };
  },
  onVersionContextMenuAction: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: VersionContextMenuAction) => {
      callback(payload);
    };

    ipcRenderer.on('gallery:version-context-menu-action', listener);
    return () => {
      ipcRenderer.removeListener('gallery:version-context-menu-action', listener);
    };
  },
  onVaultContextMenuAction: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: VaultContextMenuAction) => {
      callback(payload);
    };

    ipcRenderer.on('gallery:vault-context-menu-action', listener);
    return () => {
      ipcRenderer.removeListener('gallery:vault-context-menu-action', listener);
    };
  },
};

contextBridge.exposeInMainWorld('gallery', api);
