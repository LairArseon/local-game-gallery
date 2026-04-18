import { useCallback, useState } from 'react';
import type { GalleryClient } from '../client/contracts';

export type VersionCompressionProgress = {
  gameName: string;
  versionName: string;
  operation: 'compress' | 'decompress';
  phase: 'preparing' | 'compressing' | 'finalizing';
  percent: number;
};

type UseVersionStorageArgs = {
  galleryClient: GalleryClient;
  setStatus: (message: string) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  refreshGame: (gamePath: string) => Promise<unknown>;
};

export function useVersionStorage({
  galleryClient,
  setStatus,
  t,
  logAppEvent,
  refreshGame,
}: UseVersionStorageArgs) {
  const [compressionProgress, setCompressionProgress] = useState<VersionCompressionProgress | null>(null);

  const compressVersion = useCallback(async (
    gamePath: string,
    gameName: string,
    versionPath: string,
    versionName: string,
  ) => {
    setCompressionProgress({
      gameName,
      versionName,
      operation: 'compress',
      phase: 'preparing',
      percent: 0.08,
    });

    try {
      await logAppEvent(
        `Compression requested from UI for game "${gameName}" version "${versionName}" (${versionPath}).`,
        'info',
        'version-storage',
      );

      setCompressionProgress({
        gameName,
        versionName,
        operation: 'compress',
        phase: 'compressing',
        percent: 0.35,
      });

      const result = await galleryClient.compressGameVersion({
        gamePath,
        versionPath,
        versionName,
      });

      setCompressionProgress({
        gameName,
        versionName,
        operation: 'compress',
        phase: 'finalizing',
        percent: 1,
      });

      setStatus(result.message || t('detail.compressSuccess', { version: versionName }));
      await refreshGame(gamePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('detail.compressFailedUnknown');
      setStatus(t('detail.compressFailed', { message }));
      await logAppEvent(`Compression failed (${versionPath}): ${message}`, 'error', 'version-storage');
    } finally {
      window.setTimeout(() => {
        setCompressionProgress(null);
      }, 260);
    }
  }, [galleryClient, logAppEvent, refreshGame, setStatus, t]);

  const decompressVersion = useCallback(async (
    gamePath: string,
    gameName: string,
    versionPath: string,
    versionName: string,
  ) => {
    setCompressionProgress({
      gameName,
      versionName,
      operation: 'decompress',
      phase: 'preparing',
      percent: 0.08,
    });

    try {
      await logAppEvent(
        `Decompression requested from UI for game "${gameName}" version "${versionName}" (${versionPath}).`,
        'info',
        'version-storage',
      );

      setCompressionProgress({
        gameName,
        versionName,
        operation: 'decompress',
        phase: 'compressing',
        percent: 0.42,
      });

      const result = await galleryClient.decompressGameVersion({
        gamePath,
        versionPath,
        versionName,
      });

      setCompressionProgress({
        gameName,
        versionName,
        operation: 'decompress',
        phase: 'finalizing',
        percent: 1,
      });

      setStatus(result.message || t('detail.decompressSuccess', { version: versionName }));
      await refreshGame(gamePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('detail.decompressFailedUnknown');
      setStatus(t('detail.decompressFailed', { message }));
      await logAppEvent(`Decompression failed (${versionPath}): ${message}`, 'error', 'version-storage');
    } finally {
      window.setTimeout(() => {
        setCompressionProgress(null);
      }, 260);
    }
  }, [galleryClient, logAppEvent, refreshGame, setStatus, t]);

  return {
    compressVersion,
    decompressVersion,
    compressionProgress,
  };
}
