/**
 * Shared download domain types used by app-shell hooks/components.
 */

export type DownloadPhase = 'compressing' | 'downloading' | 'saving';

export type DownloadProgress = {
  phase: DownloadPhase;
  percent: number | null;
  fileName: string;
};
