/**
 * Version download orchestration for desktop bridge and web clients.
 */
import { useCallback, useState } from 'react';
import type { GalleryClient } from '../client/contracts';
import { resolvePreferredServiceBaseUrl } from '../client/adapters/webClient';
import type { DownloadProgress } from '../../../shared/app-shell/types/downloadTypes';
import { runDownloadTransfer } from '../../../shared/app-shell/core/downloadTransferCore';

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
  const [versionDownloadProgress, setVersionDownloadProgress] = useState<DownloadProgress | null>(null);

  const onDownloadVersion = useCallback(async (gamePath: string, versionPath: string, versionName: string) => {
    const fallbackName = `${versionName}.zip`;
    await runDownloadTransfer({
      hasDesktopBridge,
      fallbackName,
      initialPhase: 'compressing',
      initialPercent: null,
      desktopPhase: 'compressing',
      setProgress: setVersionDownloadProgress,
      setStatus,
      t,
      logAppEvent,
      logSource: 'version-download',
      logSubject: versionPath,
      saveDesktop: () => galleryClient.saveVersionDownload({
        gamePath,
        versionPath,
        suggestedName: fallbackName,
      }),
      fetchResponse: () => {
        const baseUrl = resolvePreferredServiceBaseUrl();
        const query = new URLSearchParams({ gamePath, versionPath, versionName });
        return fetch(`${baseUrl}/api/versions/download?${query.toString()}`);
      },
      defaultContentType: 'application/zip',
    });
  }, [galleryClient, hasDesktopBridge, logAppEvent, setStatus, t]);

  return {
    onDownloadVersion,
    versionDownloadProgress,
  };
}

