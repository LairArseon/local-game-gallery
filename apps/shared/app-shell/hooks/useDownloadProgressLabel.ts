/**
 * Localized label selection for floating download progress UI.
 */
import { useMemo } from 'react';
import type { DownloadProgress } from '../types/downloadTypes';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function useDownloadProgressLabel(
  downloadProgress: DownloadProgress | null,
  t: Translate,
) {
  return useMemo(() => {
    if (!downloadProgress) {
      return {
        title: '',
        percentText: null as string | null,
      };
    }

    const title = downloadProgress.phase === 'compressing'
      ? t('detail.downloadProgressCompressing')
      : downloadProgress.phase === 'downloading'
        ? t('detail.downloadProgressDownloading')
        : t('detail.downloadProgressSaving');

    const percentText = downloadProgress.phase === 'downloading'
      ? downloadProgress.percent !== null
        ? t('detail.downloadProgressPercent', { percent: downloadProgress.percent })
        : t('detail.downloadProgressUnknown')
      : null;

    return {
      title,
      percentText,
    };
  }, [downloadProgress, t]);
}

