import type { ScanProgressEvent } from '../types';

function toScanPhaseLabel(progress: ScanProgressEvent, t: (key: string, options?: Record<string, unknown>) => string) {
  switch (progress.phase) {
    case 'preparing':
      return t('actions.scanPhasePreparing');
    case 'syncing-mirror':
      return t('actions.scanPhaseSyncingMirror');
    case 'scanning-metadata':
      return t('actions.scanPhaseScanningMetadata');
    case 'scanning-media':
      return t('actions.scanPhaseScanningMedia');
    case 'scanning-extras':
      return t('actions.scanPhaseScanningExtras');
    case 'pruning-mirror':
      return t('actions.scanPhasePruningMirror');
    case 'finalizing':
      return t('actions.scanPhaseFinalizing');
    default:
      return t('actions.refreshingGallery');
  }
}

export function formatScanProgressLabel(
  progress: ScanProgressEvent,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const label = toScanPhaseLabel(progress, t);
  const percent = Math.max(0, Math.min(100, Math.round(Number(progress.percent ?? 0) * 100)));
  return t('actions.scanPhaseWithPercent', { label, percent });
}