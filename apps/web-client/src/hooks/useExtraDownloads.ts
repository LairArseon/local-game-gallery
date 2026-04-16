/**
 * Extras download orchestration for desktop bridge and web clients.
 *
 * New to this project: this hook keeps download side effects out of App while
 * preserving a single action contract for detail views.
 */
import { useCallback, useState } from 'react';
import type { GalleryClient } from '../client/contracts';
import { resolvePreferredServiceBaseUrl } from '../client/adapters/webClient';

type SaveFileHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options?: { suggestedName?: string }) => Promise<SaveFileHandle>;
};

type UseExtraDownloadsArgs = {
  hasDesktopBridge: boolean;
  galleryClient: GalleryClient;
  setStatus: (message: string) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
};

export type ExtraDownloadProgress = {
  phase: 'compressing' | 'downloading' | 'saving';
  percent: number | null;
  fileName: string;
};

export function useExtraDownloads({
  hasDesktopBridge,
  galleryClient,
  setStatus,
  t,
  logAppEvent,
}: UseExtraDownloadsArgs) {
  const [extraDownloadProgress, setExtraDownloadProgress] = useState<ExtraDownloadProgress | null>(null);

  const onDownloadExtra = useCallback(async (gamePath: string, relativePath: string, itemName: string, isDirectory: boolean) => {
    const fallbackName = isDirectory ? `${itemName}.zip` : itemName;
    const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
    let preselectedFileHandle: SaveFileHandle | null = null;

    if (!hasDesktopBridge && picker) {
      try {
        preselectedFileHandle = await picker({ suggestedName: fallbackName });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          setStatus(t('detail.downloadCancelled'));
          await logAppEvent(`Extras download cancelled by user before transfer: ${relativePath}`, 'warn', 'extras-download');
          return;
        }

        throw error;
      }
    }

    setExtraDownloadProgress({
      phase: isDirectory ? 'compressing' : 'downloading',
      percent: isDirectory ? null : 0,
      fileName: fallbackName,
    });

    try {
      if (hasDesktopBridge) {
        setExtraDownloadProgress({
          phase: isDirectory ? 'compressing' : 'saving',
          percent: null,
          fileName: fallbackName,
        });

        const result = await galleryClient.saveExtraDownload({
          gamePath,
          relativePath,
          suggestedName: fallbackName,
        });

        if (result.canceled) {
          setStatus(t('detail.downloadCancelled'));
          await logAppEvent(`Extras download cancelled by user: ${relativePath}`, 'warn', 'extras-download');
          return;
        }

        if (!result.saved) {
          setStatus(t('detail.downloadFailed', { message: result.message }));
          await logAppEvent(`Extras download failed (${relativePath}): ${result.message}`, 'error', 'extras-download');
          return;
        }

        setStatus(t('detail.downloadSaved', { name: fallbackName }));
        return;
      }

      const baseUrl = resolvePreferredServiceBaseUrl();
      const query = new URLSearchParams({ gamePath, relativePath });
      const response = await fetch(`${baseUrl}/api/extras/download?${query.toString()}`);
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
          // Keep status-based fallback when service response is not JSON.
        }

        throw new Error(errorMessage);
      }

      const contentDisposition = response.headers.get('content-disposition') ?? '';
      const filenameMatch = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(contentDisposition);
      const downloadName = filenameMatch?.[1]
        ? decodeURIComponent(filenameMatch[1])
        : filenameMatch?.[2] ?? fallbackName;

      setExtraDownloadProgress({
        phase: 'downloading',
        percent: 0,
        fileName: downloadName,
      });

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
              setExtraDownloadProgress({
                phase: 'downloading',
                percent,
                fileName: downloadName,
              });
            } else {
              setExtraDownloadProgress({
                phase: 'downloading',
                percent: null,
                fileName: downloadName,
              });
            }
          }
        }

        blob = new Blob(chunks, { type: response.headers.get('content-type') ?? 'application/octet-stream' });
      } else {
        blob = await response.blob();
      }

      setExtraDownloadProgress({
        phase: 'saving',
        percent: null,
        fileName: downloadName,
      });

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
        await logAppEvent(`Extras download cancelled by user: ${relativePath}`, 'warn', 'extras-download');
        return;
      }

      const message = error instanceof Error ? error.message : t('detail.downloadFailedUnknown');
      setStatus(t('detail.downloadFailed', { message }));
      await logAppEvent(`Extras download failed (${relativePath}): ${message}`, 'error', 'extras-download');
    } finally {
      setExtraDownloadProgress(null);
    }
  }, [galleryClient, hasDesktopBridge, logAppEvent, setStatus, t]);

  return {
    onDownloadExtra,
    extraDownloadProgress,
  };
}
