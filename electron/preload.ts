import { contextBridge, ipcRenderer } from 'electron';
import type {
  GameContextMenuPayload,
  GameContextMenuAction,
  GalleryApi,
  GalleryConfig,
  ImportDroppedGameMediaPayload,
  ImportGameMediaPayload,
  RemoveScreenshotPayload,
  PlayGamePayload,
  ReorderScreenshotsPayload,
  SaveGameMetadataPayload,
} from '../src/types';

const api: GalleryApi = {
  getConfig: () => ipcRenderer.invoke('gallery:get-config'),
  saveConfig: (config: GalleryConfig) => ipcRenderer.invoke('gallery:save-config', config),
  pickGamesRoot: () => ipcRenderer.invoke('gallery:pick-games-root'),
  scanGames: () => ipcRenderer.invoke('gallery:scan-games'),
  showGameContextMenu: (payload: GameContextMenuPayload) => ipcRenderer.invoke('gallery:show-game-context-menu', payload),
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
};

contextBridge.exposeInMainWorld('gallery', api);
