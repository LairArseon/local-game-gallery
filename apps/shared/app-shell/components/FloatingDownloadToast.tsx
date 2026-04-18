import type { DownloadProgress } from '../types/downloadTypes';

type FloatingDownloadToastProps = {
  downloadProgress: DownloadProgress | null;
  downloadProgressLabel: string;
  downloadProgressPercentText: string | null;
};

export function FloatingDownloadToast({
  downloadProgress,
  downloadProgressLabel,
  downloadProgressPercentText,
}: FloatingDownloadToastProps) {
  if (!downloadProgress) {
    return null;
  }

  return (
    <aside className="floating-extra-download" role="status" aria-live="polite">
      <p className="floating-extra-download__title">{downloadProgressLabel}</p>
      <p className="floating-extra-download__body">{downloadProgress.fileName}</p>
      {downloadProgress.phase === 'downloading' ? (
        <div className="floating-extra-download__meter" aria-hidden="true">
          <span
            className="floating-extra-download__meter-fill"
            style={{ transform: `scaleX(${Math.max(0, Math.min(1, (downloadProgress.percent ?? 15) / 100))})` }}
          />
        </div>
      ) : null}
      {downloadProgress.phase === 'downloading' && downloadProgressPercentText ? (
        <p className="floating-extra-download__percent">{downloadProgressPercentText}</p>
      ) : null}
    </aside>
  );
}

