/**
 * Version download orchestration for desktop bridge and web clients.
 */
import { useCallback, useState } from 'react';
import type { GalleryClient } from '../client/contracts';
import { resolvePreferredServiceBaseUrl } from '../client/adapters/webClient';

export type VersionDownloadProgress = {
  phase: 'compressing' | 'downloading' | 'saving';
  percent: number | null;
  fileName: string;
};

type SaveFileHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options?: { suggestedName?: string }) => Promise<SaveFileHandle>;
};

type UseVersionDownloadsArgs = {
  hasDesktopBridge: boolean;
  galleryClient: GalleryClient;
  setStatus: (message: string) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
};

export function useVersionDownloads({
  hasDesktopBridge,
  galleryClient,
  setStatus,
  t,
  logAppEvent,
}: UseVersionDownloadsArgs) {
  const [versionDownloadProgress, setVersionDownloadProgress] = useState<VersionDownloadProgress | null>(null);

  const onDownloadVersion = useCallback(async (gamePath: string, versionPath: string, versionName: string) => {
    const fallbackName = `${versionName}.zip`;
    const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
    let preselectedFileHandle: SaveFileHandle | null = null;

    if (!hasDesktopBridge && picker) {
      try {
        preselectedFileHandle = await picker({ suggestedName: fallbackName });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          setStatus(t('detail.downloadCancelled'));
          await logAppEvent(`Version download cancelled by user before transfer: ${versionPath}`, 'warn', 'version-download');
          return;
        }

        throw error;
      }
    }

    setVersionDownloadProgress({ phase: 'compressing', percent: null, fileName: fallbackName });

    try {
      if (hasDesktopBridge) {
        const result = await galleryClient.saveVersionDownload({
          gamePath,
          versionPath,
          suggestedName: fallbackName,
        });

        if (result.canceled) {
          setStatus(t('detail.downloadCancelled'));
          await logAppEvent(`Version download cancelled by user: ${versionPath}`, 'warn', 'version-download');
          return;
        }

        if (!result.saved) {
          setStatus(t('detail.downloadFailed', { message: result.message }));
          await logAppEvent(`Version download failed (${versionPath}): ${result.message}`, 'error', 'version-download');
          return;
        }

        setStatus(t('detail.downloadSaved', { name: fallbackName }));
        return;
      }

      const baseUrl = resolvePreferredServiceBaseUrl();
      const query = new URLSearchParams({ gamePath, versionPath, versionName });
      const response = await fetch(`${baseUrl}/api/versions/download?${query.toString()}`);
      if (!response.ok) {
        let errorMessage = `Download failed with status ${response.status}.`;
        try {
          const errorPayload = await response.json() as {
            ok?: boolean;
            error?: {
              message?: string;
            };
          };
          const serviceMessage = String(errorPayload?.error?.message ?? '').trim();
          if (serviceMessage) {
            errorMessage = serviceMessage;
          }
        } catch {
          // Keep status fallback.
        }

        throw new Error(errorMessage);
      }

      const contentDisposition = response.headers.get('content-disposition') ?? '';
      const filenameMatch = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(contentDisposition);
      const downloadName = filenameMatch?.[1]
        ? decodeURIComponent(filenameMatch[1])
        : filenameMatch?.[2] ?? fallbackName;

      setVersionDownloadProgress({ phase: 'downloading', percent: 0, fileName: downloadName });

      let blob: Blob;
      const responseBody = response.body;
      const totalBytesHeader = Number.parseInt(String(response.headers.get('content-length') ?? ''), 10);
      const hasKnownLength = Number.isFinite(totalBytesHeader) && totalBytesHeader > 0;
      if (responseBody) {
        const reader = responseBody.getReader();
        const chunks: Uint8Array[] = [];
        let loadedBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          if (value) {
            chunks.push(value);
            loadedBytes += value.byteLength;
            if (hasKnownLength) {
              const percent = Math.max(0, Math.min(100, Math.round((loadedBytes / totalBytesHeader) * 100)));
              setVersionDownloadProgress({ phase: 'downloading', percent, fileName: downloadName });
            } else {
              setVersionDownloadProgress({ phase: 'downloading', percent: null, fileName: downloadName });
            }
          }
        }

        blob = new Blob(chunks, { type: response.headers.get('content-type') ?? 'application/zip' });
      } else {
        blob = await response.blob();
      }

      setVersionDownloadProgress({ phase: 'saving', percent: null, fileName: downloadName });

      if (preselectedFileHandle) {
        const writable = await preselectedFileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        setStatus(t('detail.downloadSaved', { name: downloadName }));
        return;
      }

      if (picker) {
        const fileHandle = await picker({ suggestedName: downloadName });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        setStatus(t('detail.downloadSaved', { name: downloadName }));
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = downloadName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setStatus(t('detail.downloadStarted', { name: downloadName }));
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setStatus(t('detail.downloadCancelled'));
        await logAppEvent(`Version download cancelled by user: ${versionPath}`, 'warn', 'version-download');
        return;
      }

      const message = error instanceof Error ? error.message : t('detail.downloadFailedUnknown');
      setStatus(t('detail.downloadFailed', { message }));
      await logAppEvent(`Version download failed (${versionPath}): ${message}`, 'error', 'version-download');
    } finally {
      setVersionDownloadProgress(null);
    }
  }, [galleryClient, hasDesktopBridge, logAppEvent, setStatus, t]);

  return {
    onDownloadVersion,
    versionDownloadProgress,
  };
}
