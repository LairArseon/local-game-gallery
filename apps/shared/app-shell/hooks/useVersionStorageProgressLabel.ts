/**
 * Localized progress-title selector for version storage operations.
 */
import { useMemo } from 'react';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type SharedVersionCompressionProgress = {
  operation: 'compress' | 'decompress';
  phase: 'preparing' | 'compressing' | 'finalizing';
};

export function useVersionStorageProgressLabel(
  compressionProgress: SharedVersionCompressionProgress | null,
  t: Translate,
) {
  return useMemo(() => {
    if (!compressionProgress) {
      return '';
    }

    if (compressionProgress.operation === 'decompress') {
      if (compressionProgress.phase === 'preparing') {
        return t('detail.decompressProgressPreparing');
      }

      if (compressionProgress.phase === 'compressing') {
        return t('detail.decompressProgressDecompressing');
      }

      return t('detail.decompressProgressFinalizing');
    }

    if (compressionProgress.phase === 'preparing') {
      return t('detail.compressProgressPreparing');
    }

    if (compressionProgress.phase === 'compressing') {
      return t('detail.compressProgressCompressing');
    }

    return t('detail.compressProgressFinalizing');
  }, [compressionProgress, t]);
}
