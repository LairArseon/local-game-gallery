import { copyFile, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { GameMetadata, ImportStagedGameArchiveResult } from '../../src/types';
import {
  copyExtractedArchiveIntoVersion,
  extractZipToFolder,
  isPathInside,
  toDefaultImportMetadata,
  toSafeFolderName,
} from './archive-version-storage';
import { removeStagedArchiveUpload } from './staged-archive-upload';

/**
 * Shared staged archive upload/import orchestration for desktop IPC and HTTP service.
 *
 * New to this project: this module centralizes temporary archive staging and import
 * side effects so both runtime entrypoints keep identical behavior.
 */

export type StagedArchiveUploadsMap = Map<string, { filePath: string; originalFileName: string }>;

type UploadLogEvent = {
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
};

type UploadLogFn = (event: UploadLogEvent) => Promise<void>;

type StageArchiveUploadPayload = {
  fileName?: string;
  dataBase64?: string;
  filePath?: string;
};

type StageArchiveUploadArgs = {
  payload: StageArchiveUploadPayload;
  stagedUploads: StagedArchiveUploadsMap;
  source: string;
  appendLogEvent: UploadLogFn;
};

export class ArchiveUploadFlowError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function stageArchiveUpload({
  payload,
  stagedUploads,
  source,
  appendLogEvent,
}: StageArchiveUploadArgs) {
  const requestedFileName = String(payload.fileName ?? '').trim();
  const filePath = String(payload.filePath ?? '').trim();

  try {
    const uploadId = randomUUID();
    const sourceFileName = requestedFileName || (filePath ? path.basename(filePath) : '');
    if (!sourceFileName) {
      throw new ArchiveUploadFlowError('invalid_archive_payload', 'Archive file name is required.');
    }

    const extension = path.extname(sourceFileName).toLowerCase() || '.zip';
    const stagedFilePath = path.join(os.tmpdir(), `lgg-archive-upload-${uploadId}${extension}`);
    let sizeBytes = 0;
    let transport = 'base64';

    if (filePath) {
      const sourceStats = await stat(filePath);
      if (!sourceStats.isFile()) {
        throw new ArchiveUploadFlowError('invalid_archive_payload', 'Selected archive path is not a file.');
      }

      sizeBytes = sourceStats.size;
      if (!sizeBytes) {
        throw new ArchiveUploadFlowError('invalid_archive_payload', 'Uploaded archive is empty or invalid.');
      }

      await copyFile(filePath, stagedFilePath);
      transport = 'path';
    } else {
      const dataBase64 = String(payload.dataBase64 ?? '').trim();
      if (!dataBase64) {
        throw new ArchiveUploadFlowError('invalid_archive_payload', 'Archive content is required.');
      }

      const contents = Buffer.from(dataBase64, 'base64');
      if (!contents.length) {
        throw new ArchiveUploadFlowError('invalid_archive_payload', 'Uploaded archive is empty or invalid.');
      }

      sizeBytes = contents.length;
      await writeFile(stagedFilePath, contents);
    }

    stagedUploads.set(uploadId, {
      filePath: stagedFilePath,
      originalFileName: sourceFileName,
    });

    await appendLogEvent({
      level: 'info',
      source,
      message: `Staged archive upload "${sourceFileName}" as ${uploadId} (${sizeBytes} bytes, transport=${transport}).`,
    }).catch(() => undefined);

    return {
      uploadId,
      originalFileName: sourceFileName,
      sizeBytes,
    };
  } catch (error) {
    const message = toErrorMessage(error, 'Unknown stage error.');
    await appendLogEvent({
      level: 'error',
      source,
      message: `Failed to stage archive upload "${requestedFileName || filePath || 'unknown'}": ${message}`,
    }).catch(() => undefined);
    throw error;
  }
}

type ImportStagedGameArchiveArgs = {
  uploadId: string;
  gameName: string;
  versionName: string;
  existingGamePath?: string;
  metadata?: GameMetadata;
  gamesRoot: string;
  stagedUploads: StagedArchiveUploadsMap;
  source: string;
  appendLogEvent: UploadLogFn;
  saveGameMetadata: (args: { gamePath: string; title: string; metadata: GameMetadata }) => Promise<void>;
};

export async function importStagedGameArchive({
  uploadId,
  gameName,
  versionName,
  existingGamePath,
  metadata,
  gamesRoot,
  stagedUploads,
  source,
  appendLogEvent,
  saveGameMetadata,
}: ImportStagedGameArchiveArgs): Promise<ImportStagedGameArchiveResult> {
  const normalizedUploadId = String(uploadId ?? '').trim();
  const normalizedGameName = String(gameName ?? '').trim();
  const normalizedVersionName = String(versionName ?? '').trim();

  if (!normalizedUploadId || !normalizedGameName || !normalizedVersionName) {
    throw new ArchiveUploadFlowError('invalid_archive_import_payload', 'Game name, version, and staged archive are required.');
  }

  const staged = stagedUploads.get(normalizedUploadId);
  if (!staged) {
    throw new ArchiveUploadFlowError('staged_archive_not_found', 'Staged archive not found. Re-select file and try again.', 404);
  }

  const normalizedGamesRoot = String(gamesRoot ?? '').trim();
  if (!normalizedGamesRoot) {
    throw new ArchiveUploadFlowError('missing_games_root', 'Games root is not configured on host.');
  }

  const resolvedGamesRoot = path.resolve(normalizedGamesRoot);
  const normalizedExistingGamePath = String(existingGamePath ?? '').trim();
  const fallbackGamePath = path.join(resolvedGamesRoot, toSafeFolderName(normalizedGameName, 'Imported Game'));
  const targetGamePath = normalizedExistingGamePath ? path.resolve(normalizedExistingGamePath) : fallbackGamePath;

  if (!isPathInside(resolvedGamesRoot, targetGamePath)) {
    throw new ArchiveUploadFlowError('forbidden_game_path', 'Target game path is outside allowed gallery roots.', 403);
  }

  const targetVersionPath = path.join(targetGamePath, toSafeFolderName(normalizedVersionName, 'Version'));
  const extractRoot = await mkdtemp(path.join(os.tmpdir(), `lgg-archive-extract-${normalizedUploadId}-`));

  try {
    await appendLogEvent({
      level: 'info',
      source,
      message: `Importing staged archive ${normalizedUploadId} into "${targetVersionPath}".`,
    }).catch(() => undefined);

    await mkdir(targetVersionPath, { recursive: true });
    await extractZipToFolder(staged.filePath, extractRoot);
    await copyExtractedArchiveIntoVersion(extractRoot, targetVersionPath);

    const mergedMetadata = {
      ...toDefaultImportMetadata(normalizedVersionName),
      ...(metadata ?? {}),
      latestVersion: String(metadata?.latestVersion ?? normalizedVersionName).trim() || normalizedVersionName,
    };

    await saveGameMetadata({
      gamePath: targetGamePath,
      title: normalizedGameName,
      metadata: mergedMetadata,
    });

    await appendLogEvent({
      level: 'info',
      source,
      message: `Imported staged archive ${normalizedUploadId} into "${targetVersionPath}".`,
    }).catch(() => undefined);

    return {
      imported: true,
      gamePath: targetGamePath,
      versionPath: targetVersionPath,
      message: `Imported ${normalizedGameName} (${normalizedVersionName}).`,
    };
  } catch (error) {
    const message = toErrorMessage(error, 'Unknown import error.');
    await appendLogEvent({
      level: 'error',
      source,
      message: `Failed to import staged archive ${normalizedUploadId}: ${message}`,
    }).catch(() => undefined);
    throw error;
  } finally {
    await rm(extractRoot, { recursive: true, force: true }).catch(() => undefined);
    await removeStagedArchiveUpload(stagedUploads, normalizedUploadId);
  }
}
