import { useCallback, useState } from 'react';

export type VersionCompressionProgress = {
  gameName: string;
  versionName: string;
  operation: 'compress' | 'decompress';
  phase: 'preparing' | 'compressing' | 'finalizing';
  percent: number;
  processedBytes: number;
  totalBytes: number;
};

type GalleryClientLike = {
  compressGameVersion: (args: {
    gamePath: string;
    versionPath: string;
    versionName: string;
    operationId?: string;
  }) => Promise<{ message?: string }>;
  decompressGameVersion: (args: {
    gamePath: string;
    versionPath: string;
    versionName: string;
    operationId?: string;
  }) => Promise<{ message?: string }>;
  onVersionStorageProgress?: (callback: (payload: {
    operationId: string;
    operation: 'compress' | 'decompress';
    phase: 'preparing' | 'compressing' | 'finalizing';
    percent: number;
    processedBytes: number;
    totalBytes: number;
    gameName: string;
    versionName: string;
  }) => void) => () => void;
};

type UseVersionStorageArgs = {
  galleryClient: GalleryClientLike;
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
    const operationId = `vs-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const supportsProgressEvents = typeof galleryClient.onVersionStorageProgress === 'function';
    let receivedProgressEvent = false;
    let fallbackPercent = 0.35;
    let fallbackProgressTicker: number | null = null;
    const startFallbackProgressTicker = () => {
      if (fallbackProgressTicker !== null) {
        return;
      }

      fallbackProgressTicker = window.setInterval(() => {
        fallbackPercent = Math.min(0.92, fallbackPercent + ((0.94 - fallbackPercent) * 0.08));
        setCompressionProgress((current) => {
          if (!current || current.operation !== 'compress') {
            return current;
          }

          if (current.phase === 'finalizing') {
            return current;
          }

          return {
            ...current,
            phase: 'compressing',
            percent: fallbackPercent,
          };
        });
      }, 220);
    };
    const progressFallbackTimer = supportsProgressEvents
      ? window.setTimeout(() => {
          if (receivedProgressEvent) {
            return;
          }

          void logAppEvent(
            `Compression progress events not received for ${versionName}; using fallback progress animation.`,
            'warn',
            'version-storage-progress',
          );
          startFallbackProgressTicker();
          setCompressionProgress({
            gameName,
            versionName,
            operation: 'compress',
            phase: 'compressing',
            percent: fallbackPercent,
            processedBytes: 0,
            totalBytes: 0,
          });
        }, 500)
      : null;
    const disposeProgressListener = galleryClient.onVersionStorageProgress?.((event) => {
      if (event.operationId !== operationId || event.operation !== 'compress') {
        return;
      }

      receivedProgressEvent = true;
      if (progressFallbackTimer !== null) {
        window.clearTimeout(progressFallbackTimer);
      }
      if (fallbackProgressTicker !== null) {
        window.clearInterval(fallbackProgressTicker);
        fallbackProgressTicker = null;
      }

      setCompressionProgress({
        gameName: event.gameName || gameName,
        versionName: event.versionName || versionName,
        operation: event.operation,
        phase: event.phase,
        percent: Math.max(0, Math.min(1, event.percent)),
        processedBytes: Math.max(0, Number(event.processedBytes ?? 0)),
        totalBytes: Math.max(0, Number(event.totalBytes ?? 0)),
      });
    });

    setCompressionProgress({
      gameName,
      versionName,
      operation: 'compress',
      phase: 'preparing',
      percent: 0.08,
      processedBytes: 0,
      totalBytes: 0,
    });

    try {
      await logAppEvent(
        `Compression requested from UI for game "${gameName}" version "${versionName}" (${versionPath}).`,
        'info',
        'version-storage',
      );

      if (!supportsProgressEvents) {
        startFallbackProgressTicker();
        setCompressionProgress({
          gameName,
          versionName,
          operation: 'compress',
          phase: 'compressing',
          percent: fallbackPercent,
          processedBytes: 0,
          totalBytes: 0,
        });
      }

      const result = await galleryClient.compressGameVersion({
        gamePath,
        versionPath,
        versionName,
        operationId,
      });

      setCompressionProgress({
        gameName,
        versionName,
        operation: 'compress',
        phase: 'finalizing',
        percent: 1,
        processedBytes: 0,
        totalBytes: 0,
      });

      setStatus(result.message || t('detail.compressSuccess', { version: versionName }));
      await refreshGame(gamePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('detail.compressFailedUnknown');
      setStatus(t('detail.compressFailed', { message }));
      await logAppEvent(`Compression failed (${versionPath}): ${message}`, 'error', 'version-storage');
    } finally {
      if (progressFallbackTimer !== null) {
        window.clearTimeout(progressFallbackTimer);
      }
      if (fallbackProgressTicker !== null) {
        window.clearInterval(fallbackProgressTicker);
      }
      disposeProgressListener?.();
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
    const operationId = `vs-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const supportsProgressEvents = typeof galleryClient.onVersionStorageProgress === 'function';
    let receivedProgressEvent = false;
    let fallbackPercent = 0.42;
    let fallbackProgressTicker: number | null = null;
    const startFallbackProgressTicker = () => {
      if (fallbackProgressTicker !== null) {
        return;
      }

      fallbackProgressTicker = window.setInterval(() => {
        fallbackPercent = Math.min(0.92, fallbackPercent + ((0.94 - fallbackPercent) * 0.08));
        setCompressionProgress((current) => {
          if (!current || current.operation !== 'decompress') {
            return current;
          }

          if (current.phase === 'finalizing') {
            return current;
          }

          return {
            ...current,
            phase: 'compressing',
            percent: fallbackPercent,
          };
        });
      }, 220);
    };
    const progressFallbackTimer = supportsProgressEvents
      ? window.setTimeout(() => {
          if (receivedProgressEvent) {
            return;
          }

          void logAppEvent(
            `Decompression progress events not received for ${versionName}; using fallback progress animation.`,
            'warn',
            'version-storage-progress',
          );
          startFallbackProgressTicker();
          setCompressionProgress({
            gameName,
            versionName,
            operation: 'decompress',
            phase: 'compressing',
            percent: fallbackPercent,
            processedBytes: 0,
            totalBytes: 0,
          });
        }, 500)
      : null;
    const disposeProgressListener = galleryClient.onVersionStorageProgress?.((event) => {
      if (event.operationId !== operationId || event.operation !== 'decompress') {
        return;
      }

      receivedProgressEvent = true;
      if (progressFallbackTimer !== null) {
        window.clearTimeout(progressFallbackTimer);
      }
      if (fallbackProgressTicker !== null) {
        window.clearInterval(fallbackProgressTicker);
        fallbackProgressTicker = null;
      }

      setCompressionProgress({
        gameName: event.gameName || gameName,
        versionName: event.versionName || versionName,
        operation: event.operation,
        phase: event.phase,
        percent: Math.max(0, Math.min(1, event.percent)),
        processedBytes: Math.max(0, Number(event.processedBytes ?? 0)),
        totalBytes: Math.max(0, Number(event.totalBytes ?? 0)),
      });
    });

    setCompressionProgress({
      gameName,
      versionName,
      operation: 'decompress',
      phase: 'preparing',
      percent: 0.08,
      processedBytes: 0,
      totalBytes: 0,
    });

    try {
      await logAppEvent(
        `Decompression requested from UI for game "${gameName}" version "${versionName}" (${versionPath}).`,
        'info',
        'version-storage',
      );

      if (!supportsProgressEvents) {
        startFallbackProgressTicker();
        setCompressionProgress({
          gameName,
          versionName,
          operation: 'decompress',
          phase: 'compressing',
          percent: fallbackPercent,
          processedBytes: 0,
          totalBytes: 0,
        });
      }

      const result = await galleryClient.decompressGameVersion({
        gamePath,
        versionPath,
        versionName,
        operationId,
      });

      setCompressionProgress({
        gameName,
        versionName,
        operation: 'decompress',
        phase: 'finalizing',
        percent: 1,
        processedBytes: 0,
        totalBytes: 0,
      });

      setStatus(result.message || t('detail.decompressSuccess', { version: versionName }));
      await refreshGame(gamePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('detail.decompressFailedUnknown');
      setStatus(t('detail.decompressFailed', { message }));
      await logAppEvent(`Decompression failed (${versionPath}): ${message}`, 'error', 'version-storage');
    } finally {
      if (progressFallbackTimer !== null) {
        window.clearTimeout(progressFallbackTimer);
      }
      if (fallbackProgressTicker !== null) {
        window.clearInterval(fallbackProgressTicker);
      }
      disposeProgressListener?.();
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
