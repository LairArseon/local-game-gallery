import { useCallback, useEffect, useState, type ChangeEvent, type DragEvent } from 'react';
import type { GalleryClient } from '../client/contracts';
import type { GameMetadata, StageGameArchiveUploadResult } from '../types';
import { normalizeTagPool } from '../utils/app-helpers';

type UseGameArchiveUploadArgs = {
  galleryClient: GalleryClient;
  statusChoices: string[];
  setStatus: (value: string) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  onImported: (gamePath: string | null) => Promise<void>;
};

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

function parseLines(value: string) {
  return value
    .split(/\r?\n/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseTags(value: string) {
  return normalizeTagPool(
    value
      .split(/[\r\n,]+/g)
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

function deriveGameNameFromArchiveFile(fileName: string) {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return '';
  }

  const withoutExtension = trimmed.replace(/\.[^.]+$/, '');
  return withoutExtension.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const maxBase64StageSizeBytes = 200 * 1024 * 1024;

export function useGameArchiveUpload({
  galleryClient,
  statusChoices,
  setStatus,
  t,
  logAppEvent,
  onImported,
}: UseGameArchiveUploadArgs) {
  const [isOpen, setIsOpen] = useState(false);
  const [existingGamePath, setExistingGamePath] = useState<string | null>(null);

  const [gameName, setGameName] = useState('');
  const [versionName, setVersionName] = useState('');

  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [score, setScore] = useState('');
  const [metadataStatus, setMetadataStatus] = useState('');
  const [description, setDescription] = useState('');
  const [notesText, setNotesText] = useState('');
  const [tagsText, setTagsText] = useState('');

  const [stagedUploadId, setStagedUploadId] = useState<string | null>(null);
  const [stagedFileName, setStagedFileName] = useState<string | null>(null);

  const [isDragActive, setIsDragActive] = useState(false);
  const [isStagingFile, setIsStagingFile] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'staging' | 'importing'>('idle');

  useEffect(() => {
    if (uploadPhase === 'idle') {
      return;
    }

    const progressInterval = window.setInterval(() => {
      setUploadProgress((current) => {
        if (current >= 0.94) {
          return current;
        }

        const easedNext = current + ((1 - current) * 0.1);
        return Math.min(easedNext, 0.94);
      });
    }, 150);

    return () => {
      window.clearInterval(progressInterval);
    };
  }, [uploadPhase]);

  useEffect(() => {
    if (uploadPhase !== 'idle' || uploadProgress <= 0) {
      return;
    }

    if (uploadProgress < 1) {
      setUploadProgress(1);
    }

    const resetDelay = window.setTimeout(() => {
      setUploadProgress(0);
    }, 240);

    return () => {
      window.clearTimeout(resetDelay);
    };
  }, [uploadPhase, uploadProgress]);

  const clearDraft = useCallback(() => {
    setExistingGamePath(null);
    setGameName('');
    setVersionName('');
    setIsAdvancedOpen(false);
    setScore('');
    setMetadataStatus('');
    setDescription('');
    setNotesText('');
    setTagsText('');
    setStagedUploadId(null);
    setStagedFileName(null);
    setIsDragActive(false);
    setUploadProgress(0);
    setUploadPhase('idle');
  }, []);

  const cancelStagedFile = useCallback(async () => {
    if (!stagedUploadId) {
      return;
    }

    try {
      await logAppEvent(`Cancelling staged archive upload: ${stagedUploadId}`, 'info', 'game-upload');
      await galleryClient.cancelStagedGameArchiveUpload({ uploadId: stagedUploadId });
      await logAppEvent(`Cancelled staged archive upload: ${stagedUploadId}`, 'info', 'game-upload');
    } catch {
      // Ignore cancel failures during close/unmount cleanup.
      await logAppEvent(`Failed to cancel staged archive upload: ${stagedUploadId}`, 'warn', 'game-upload');
    } finally {
      setStagedUploadId(null);
      setStagedFileName(null);
    }
  }, [galleryClient, logAppEvent, stagedUploadId]);

  useEffect(() => {
    return () => {
      if (!stagedUploadId) {
        return;
      }

      void galleryClient.cancelStagedGameArchiveUpload({ uploadId: stagedUploadId }).catch(() => {
        // Best-effort cleanup for staged temp files.
      });
    };
  }, [galleryClient, stagedUploadId]);

  const closeModal = useCallback(async () => {
    await logAppEvent('Closing archive upload modal.', 'info', 'game-upload');
    await cancelStagedFile();
    clearDraft();
    setIsOpen(false);
  }, [cancelStagedFile, clearDraft, logAppEvent]);

  const openModal = useCallback((initialGameName = '', initialGamePath: string | null = null) => {
    clearDraft();
    setGameName(initialGameName);
    setExistingGamePath(initialGamePath);
    setIsOpen(true);
    void logAppEvent(
      `Opening archive upload modal (mode=${initialGamePath ? 'add-version' : 'new-game'}, game="${initialGameName || 'empty'}").`,
      'info',
      'game-upload',
    );
  }, [clearDraft, logAppEvent]);

  const stageArchiveFile = useCallback(async (file: File) => {
    setIsStagingFile(true);
    setIsDragActive(false);
    setUploadProgress(0.05);
    setUploadPhase('staging');
    await logAppEvent(
      `Staging archive selected by user: name="${file.name}", type="${file.type || 'unknown'}", size=${file.size} bytes.`,
      'info',
      'game-upload',
    );

    try {
      if (stagedUploadId) {
        await logAppEvent(`Replacing previous staged archive upload: ${stagedUploadId}`, 'info', 'game-upload');
        await galleryClient.cancelStagedGameArchiveUpload({ uploadId: stagedUploadId });
      }

      const desktopFilePath = String((file as File & { path?: string }).path ?? '').trim();
      let staged: StageGameArchiveUploadResult | null = null;

      if (desktopFilePath) {
        await logAppEvent(`Staging archive via filesystem path: "${desktopFilePath}".`, 'info', 'game-upload');
        staged = await galleryClient.stageGameArchiveUpload({
          fileName: file.name,
          mimeType: file.type,
          filePath: desktopFilePath,
        });
      } else {
        if (file.size > maxBase64StageSizeBytes) {
          await logAppEvent(
            `Large archive selected without path support (${file.size} bytes). Requesting native desktop file picker fallback.`,
            'warn',
            'game-upload',
          );

          const pickedArchive = await galleryClient.pickArchiveUploadFile();
          if (!pickedArchive) {
            throw new Error('Archive selection was cancelled in desktop picker.');
          }

          await logAppEvent(
            `Staging archive via native picker path: "${pickedArchive.filePath}" (${pickedArchive.sizeBytes} bytes).`,
            'info',
            'game-upload',
          );

          staged = await galleryClient.stageGameArchiveUpload({
            fileName: pickedArchive.fileName,
            filePath: pickedArchive.filePath,
          });
        }

        if (!staged) {
          await logAppEvent('Staging archive via base64 payload fallback.', 'info', 'game-upload');
          staged = await galleryClient.stageGameArchiveUpload({
            fileName: file.name,
            mimeType: file.type,
            dataBase64: arrayBufferToBase64(await file.arrayBuffer()),
          });
        }
      }

      setStagedUploadId(staged.uploadId);
      setStagedFileName(staged.originalFileName);
      await logAppEvent(
        `Archive staged successfully: uploadId=${staged.uploadId}, name="${staged.originalFileName}", size=${staged.sizeBytes} bytes.`,
        'info',
        'game-upload',
      );

      if (!existingGamePath && !gameName.trim()) {
        const derivedName = deriveGameNameFromArchiveFile(staged.originalFileName);
        if (derivedName) {
          setGameName(derivedName);
          await logAppEvent(`Auto-filled game name from archive file: "${derivedName}".`, 'info', 'game-upload');
        } else {
          await logAppEvent('Archive staged but game name auto-fill produced an empty result.', 'warn', 'game-upload');
        }
      }

      setStatus(t('upload.statusFileStaged', { name: staged.originalFileName }));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('upload.statusStageFailed');
      setStatus(t('upload.statusStageFailedWithReason', { message }));
      await logAppEvent(`Archive staging failed: ${message}`, 'error', 'game-upload');
    } finally {
      setUploadProgress(1);
      setUploadPhase('idle');
      setIsStagingFile(false);
    }
  }, [existingGamePath, galleryClient, gameName, logAppEvent, setStatus, stagedUploadId, t]);

  const onRequestPickArchive = useCallback(async () => {
    try {
      const pickedArchive = await galleryClient.pickArchiveUploadFile();
      if (!pickedArchive) {
        await logAppEvent('Native archive picker was cancelled by user.', 'info', 'game-upload');
        return true;
      }

      setIsStagingFile(true);
      setIsDragActive(false);
      setUploadProgress(0.05);
      setUploadPhase('staging');

      await logAppEvent(
        `Archive selected via native picker: "${pickedArchive.fileName}" (${pickedArchive.sizeBytes} bytes).`,
        'info',
        'game-upload',
      );

      try {
        if (stagedUploadId) {
          await logAppEvent(`Replacing previous staged archive upload: ${stagedUploadId}`, 'info', 'game-upload');
          await galleryClient.cancelStagedGameArchiveUpload({ uploadId: stagedUploadId });
        }

        const staged = await galleryClient.stageGameArchiveUpload({
          fileName: pickedArchive.fileName,
          filePath: pickedArchive.filePath,
        });

        setStagedUploadId(staged.uploadId);
        setStagedFileName(staged.originalFileName);
        await logAppEvent(
          `Archive staged successfully: uploadId=${staged.uploadId}, name="${staged.originalFileName}", size=${staged.sizeBytes} bytes.`,
          'info',
          'game-upload',
        );

        if (!existingGamePath && !gameName.trim()) {
          const derivedName = deriveGameNameFromArchiveFile(staged.originalFileName);
          if (derivedName) {
            setGameName(derivedName);
            await logAppEvent(`Auto-filled game name from archive file: "${derivedName}".`, 'info', 'game-upload');
          } else {
            await logAppEvent('Archive staged but game name auto-fill produced an empty result.', 'warn', 'game-upload');
          }
        }

        setStatus(t('upload.statusFileStaged', { name: staged.originalFileName }));
      } catch (error) {
        const message = error instanceof Error ? error.message : t('upload.statusStageFailed');
        setStatus(t('upload.statusStageFailedWithReason', { message }));
        await logAppEvent(`Archive staging failed: ${message}`, 'error', 'game-upload');
      } finally {
        setUploadProgress(1);
        setUploadPhase('idle');
        setIsStagingFile(false);
      }

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const unsupported = message.toLowerCase().includes('not supported') || message.toLowerCase().includes('only available');
      if (unsupported) {
        return false;
      }

      setStatus(t('upload.statusStageFailedWithReason', { message }));
      await logAppEvent(`Native archive picker failed: ${message}`, 'error', 'game-upload');
      return true;
    }
  }, [existingGamePath, galleryClient, gameName, logAppEvent, setStatus, stagedUploadId, t]);

  const onFileInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      void logAppEvent('Archive file picker closed without selecting a file.', 'warn', 'game-upload');
      return;
    }

    void logAppEvent(`Archive file picked via browse: "${file.name}".`, 'info', 'game-upload');
    void stageArchiveFile(file);
    event.target.value = '';
  }, [logAppEvent, stageArchiveFile]);

  const onDropArchive = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) {
      void logAppEvent('Drop event received but no file was present in dataTransfer.', 'warn', 'game-upload');
      return;
    }

    void logAppEvent(`Archive file dropped: "${file.name}".`, 'info', 'game-upload');
    void stageArchiveFile(file);
  }, [logAppEvent, stageArchiveFile]);

  const onSubmitImport = useCallback(async () => {
    if (!gameName.trim() || !versionName.trim()) {
      setStatus(t('upload.statusNameVersionRequired'));
      await logAppEvent('Import blocked: Name and Version No. are required.', 'warn', 'game-upload');
      return;
    }

    if (!stagedUploadId) {
      setStatus(t('upload.statusArchiveRequired'));
      await logAppEvent('Import blocked: no staged archive upload is available.', 'warn', 'game-upload');
      return;
    }

    setIsImporting(true);
    setUploadProgress(0.08);
    setUploadPhase('importing');
    await logAppEvent(
      `Starting archive import: uploadId=${stagedUploadId}, game="${gameName.trim()}", version="${versionName.trim()}", mode=${existingGamePath ? 'add-version' : 'new-game'}.`,
      'info',
      'game-upload',
    );

    try {
      const metadata: GameMetadata = {
        latestVersion: versionName.trim(),
        score: score.trim(),
        status: metadataStatus.trim(),
        description: description.trim(),
        notes: parseLines(notesText),
        tags: parseTags(tagsText),
        launchExecutable: '',
        customTags: [],
      };

      const result = await galleryClient.importStagedGameArchive({
        uploadId: stagedUploadId,
        gameName: gameName.trim(),
        versionName: versionName.trim(),
        existingGamePath: existingGamePath ?? undefined,
        metadata,
      });

      setStatus(result.message);
      await logAppEvent(`Archive imported: ${result.message}`, 'info', 'game-upload');
      await onImported(result.gamePath);

      clearDraft();
      setIsOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('upload.statusImportFailed');
      setStatus(t('upload.statusImportFailedWithReason', { message }));
      await logAppEvent(`Archive import failed: ${message}`, 'error', 'game-upload');
    } finally {
      setUploadProgress(1);
      setUploadPhase('idle');
      setIsImporting(false);
    }
  }, [
    clearDraft,
    description,
    existingGamePath,
    gameName,
    galleryClient,
    logAppEvent,
    metadataStatus,
    notesText,
    onImported,
    score,
    setStatus,
    stagedUploadId,
    t,
    tagsText,
    versionName,
  ]);

  return {
    isOpen,
    openModal,
    closeModal,
    gameName,
    isGameNameLocked: Boolean(existingGamePath),
    setGameName,
    versionName,
    setVersionName,
    statusChoices,
    isAdvancedOpen,
    setIsAdvancedOpen,
    score,
    setScore,
    metadataStatus,
    setMetadataStatus,
    description,
    setDescription,
    notesText,
    setNotesText,
    tagsText,
    setTagsText,
    stagedFileName,
    isStagingFile,
    isImporting,
    uploadProgress,
    uploadPhase,
    isDragActive,
    setIsDragActive,
    onFileInputChange,
    onRequestPickArchive,
    onDropArchive,
    onSubmitImport,
  };
}
