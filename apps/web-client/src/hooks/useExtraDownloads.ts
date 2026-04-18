/**
 * Extras download orchestration for desktop bridge and web clients.
 *
 * New to this project: this hook keeps download side effects out of App while
 * preserving a single action contract for detail views.
 */
import { useCallback, useState } from 'react';
import type { GalleryClient } from '../client/contracts';
import { resolvePreferredServiceBaseUrl } from '../client/adapters/webClient';
import type { DownloadProgress } from '../../../shared/app-shell/types/downloadTypes';
import { runDownloadTransfer } from '../../../shared/app-shell/core/downloadTransferCore';

type UseExtraDownloadsArgs = {
  hasDesktopBridge: boolean;
  galleryClient: GalleryClient;
  setStatus: (message: string) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
};

export function useExtraDownloads({
  hasDesktopBridge,
  galleryClient,
  setStatus,
  t,
  logAppEvent,
}: UseExtraDownloadsArgs) {
  const [extraDownloadProgress, setExtraDownloadProgress] = useState<DownloadProgress | null>(null);

  const onDownloadExtra = useCallback(async (gamePath: string, relativePath: string, itemName: string, isDirectory: boolean) => {
    const fallbackName = isDirectory ? `${itemName}.zip` : itemName;
    await runDownloadTransfer({
      hasDesktopBridge,
      fallbackName,
      initialPhase: isDirectory ? 'compressing' : 'downloading',
      initialPercent: isDirectory ? null : 0,
      desktopPhase: isDirectory ? 'compressing' : 'saving',
      setProgress: setExtraDownloadProgress,
      setStatus,
      t,
      logAppEvent,
      logSource: 'extras-download',
      logSubject: relativePath,
      saveDesktop: () => galleryClient.saveExtraDownload({
        gamePath,
        relativePath,
        suggestedName: fallbackName,
      }),
      fetchResponse: () => {
        const baseUrl = resolvePreferredServiceBaseUrl();
        const query = new URLSearchParams({ gamePath, relativePath });
        return fetch(`${baseUrl}/api/extras/download?${query.toString()}`);
      },
      defaultContentType: 'application/octet-stream',
    });
  }, [galleryClient, hasDesktopBridge, logAppEvent, setStatus, t]);

  return {
    onDownloadExtra,
    extraDownloadProgress,
  };
}

