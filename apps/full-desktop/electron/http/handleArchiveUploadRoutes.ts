import type { IncomingMessage, ServerResponse } from 'node:http';
import type { GalleryConfig, SaveGameMetadataPayload, ServiceCapabilities } from '../../src/types';
import { ArchiveUploadFlowError, importStagedGameArchive, stageArchiveUpload } from '../shared/archive-upload-flow';
import { removeStagedArchiveUpload } from '../shared/staged-archive-upload';

/**
 * Handles HTTP routes for staged archive upload lifecycle operations.
 *
 * New to this project: this keeps archive-upload route wiring independent from
 * the larger service.ts request pipeline.
 */

type StageArchiveUploadPayload = {
  fileName: string;
  mimeType?: string;
  dataBase64?: string;
  filePath?: string;
};

type CancelArchiveUploadPayload = {
  uploadId: string;
};

type ImportArchiveUploadPayload = {
  uploadId: string;
  gameName: string;
  versionName: string;
  existingGamePath?: string;
  metadata?: SaveGameMetadataPayload['metadata'];
};

type HandleArchiveUploadRoutesArgs = {
  method: string;
  route: string;
  request: IncomingMessage;
  response: ServerResponse;
  resolveRequestCapabilities: (request: IncomingMessage) => ServiceCapabilities;
  readJsonBody: <T>(request: IncomingMessage) => Promise<T>;
  sendOk: <T>(response: ServerResponse, data: T, statusCode?: number) => void;
  sendError: (response: ServerResponse, statusCode: number, code: string, message: string) => void;
  toErrorMessage: (error: unknown, fallback: string) => string;
  stagedUploads: Map<string, { filePath: string; originalFileName: string }>;
  appendLogEvent: (event: { level: 'info' | 'warn' | 'error'; source: string; message: string }) => Promise<void>;
  loadRuntimeConfig: () => Promise<GalleryConfig>;
  saveGameMetadata: (payload: SaveGameMetadataPayload) => Promise<void>;
};

export async function handleArchiveUploadRoutes({
  method,
  route,
  request,
  response,
  resolveRequestCapabilities,
  readJsonBody,
  sendOk,
  sendError,
  toErrorMessage,
  stagedUploads,
  appendLogEvent,
  loadRuntimeConfig,
  saveGameMetadata,
}: HandleArchiveUploadRoutesArgs) {
  if (method === 'POST' && route === '/api/archive-upload/stage') {
    const capabilities = resolveRequestCapabilities(request);
    if (!capabilities.supportsLaunch) {
      sendError(response, 403, 'forbidden_host_action', 'Archive upload is allowed only for same-machine clients.');
      return true;
    }

    try {
      const payload = await readJsonBody<StageArchiveUploadPayload>(request);
      const stagedResult = await stageArchiveUpload({
        payload,
        stagedUploads,
        source: 'service-game-upload',
        appendLogEvent,
      });

      sendOk(response, stagedResult);
    } catch (error) {
      if (error instanceof ArchiveUploadFlowError) {
        sendError(response, error.statusCode, error.code, error.message);
        return true;
      }

      sendError(response, 400, 'archive_stage_failed', toErrorMessage(error, 'Failed to stage archive upload.'));
    }

    return true;
  }

  if (method === 'DELETE' && route === '/api/archive-upload/stage') {
    try {
      const payload = await readJsonBody<CancelArchiveUploadPayload>(request);
      const uploadId = String(payload.uploadId ?? '').trim();
      if (!uploadId) {
        await appendLogEvent({
          level: 'warn',
          source: 'service-game-upload',
          message: 'Cancel staged archive requested without an uploadId.',
        }).catch(() => undefined);
        sendOk(response, { cancelled: false });
        return true;
      }

      await removeStagedArchiveUpload(stagedUploads, uploadId);
      await appendLogEvent({
        level: 'info',
        source: 'service-game-upload',
        message: `Cancelled staged archive upload ${uploadId}.`,
      }).catch(() => undefined);
      sendOk(response, { cancelled: true });
    } catch (error) {
      await appendLogEvent({
        level: 'error',
        source: 'service-game-upload',
        message: `Failed to cancel staged archive upload: ${toErrorMessage(error, 'Unknown cancel error.')}`,
      }).catch(() => undefined);
      sendError(response, 400, 'archive_cancel_failed', toErrorMessage(error, 'Failed to cancel staged archive upload.'));
    }

    return true;
  }

  if (method === 'POST' && route === '/api/archive-upload/import') {
    const capabilities = resolveRequestCapabilities(request);
    if (!capabilities.supportsLaunch) {
      sendError(response, 403, 'forbidden_host_action', 'Archive import is allowed only for same-machine clients.');
      return true;
    }

    try {
      const payload = await readJsonBody<ImportArchiveUploadPayload>(request);
      const config = await loadRuntimeConfig();
      const result = await importStagedGameArchive({
        uploadId: payload.uploadId,
        gameName: payload.gameName,
        versionName: payload.versionName,
        existingGamePath: payload.existingGamePath,
        metadata: payload.metadata,
        gamesRoot: String(config.gamesRoot ?? '').trim(),
        stagedUploads,
        source: 'service-game-upload',
        appendLogEvent,
        saveGameMetadata,
      });

      sendOk(response, result);
    } catch (error) {
      if (error instanceof ArchiveUploadFlowError) {
        sendError(response, error.statusCode, error.code, error.message);
        return true;
      }

      sendError(response, 400, 'archive_import_failed', toErrorMessage(error, 'Failed to import staged archive.'));
    }

    return true;
  }

  return false;
}
