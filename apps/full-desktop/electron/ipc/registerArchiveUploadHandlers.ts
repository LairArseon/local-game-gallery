import { ipcMain } from 'electron';
import type {
  CancelStagedGameArchiveUploadPayload,
  GalleryConfig,
  ImportStagedGameArchivePayload,
  ImportStagedGameArchiveResult,
  SaveGameMetadataPayload,
  StageGameArchiveUploadPayload,
  StageGameArchiveUploadResult,
} from '../../src/types';
import { importStagedGameArchive, stageArchiveUpload } from '../shared/archive-upload-flow';
import { removeStagedArchiveUpload } from '../shared/staged-archive-upload';

/**
 * Registers IPC handlers for staged archive upload lifecycle operations.
 *
 * New to this project: this keeps archive-upload IPC routing isolated from
 * broader Electron bootstrap wiring in main.ts.
 */

type RegisterArchiveUploadHandlersArgs = {
  stagedUploads: Map<string, { filePath: string; originalFileName: string }>;
  appendLogEvent: (event: { level: 'info' | 'warn' | 'error'; source: string; message: string }) => Promise<void>;
  loadConfig: () => Promise<GalleryConfig>;
  saveGameMetadata: (payload: SaveGameMetadataPayload) => Promise<void>;
};

export function registerArchiveUploadHandlers({
  stagedUploads,
  appendLogEvent,
  loadConfig,
  saveGameMetadata,
}: RegisterArchiveUploadHandlersArgs) {
  ipcMain.handle('gallery:stage-game-archive-upload', async (_event, payload: StageGameArchiveUploadPayload): Promise<StageGameArchiveUploadResult> => {
    return stageArchiveUpload({
      payload,
      stagedUploads,
      source: 'main-game-upload',
      appendLogEvent,
    });
  });

  ipcMain.handle('gallery:cancel-staged-game-archive-upload', async (_event, payload: CancelStagedGameArchiveUploadPayload) => {
    const uploadId = String(payload?.uploadId ?? '').trim();
    if (!uploadId) {
      await appendLogEvent({
        level: 'warn',
        source: 'main-game-upload',
        message: 'Cancel staged archive requested without an uploadId.',
      }).catch(() => undefined);
      return;
    }

    await removeStagedArchiveUpload(stagedUploads, uploadId);
    await appendLogEvent({
      level: 'info',
      source: 'main-game-upload',
      message: `Cancelled staged archive upload ${uploadId}.`,
    }).catch(() => undefined);
  });

  ipcMain.handle('gallery:import-staged-game-archive', async (_event, payload: ImportStagedGameArchivePayload): Promise<ImportStagedGameArchiveResult> => {
    const config = await loadConfig();
    return importStagedGameArchive({
      uploadId: payload.uploadId,
      gameName: payload.gameName,
      versionName: payload.versionName,
      existingGamePath: payload.existingGamePath,
      metadata: payload.metadata,
      gamesRoot: String(config.gamesRoot ?? '').trim(),
      stagedUploads,
      source: 'main-game-upload',
      appendLogEvent,
      saveGameMetadata,
    });
  });
}
