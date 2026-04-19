/**
 * Floating progress toast for version storage operations.
 */
import { formatByteSize } from '../utils/app-helpers';

type SharedVersionCompressionProgress = {
  gameName: string;
  versionName: string;
  percent: number;
  processedBytes?: number;
  totalBytes?: number;
};

type FloatingVersionStorageToastProps = {
  compressionProgress: SharedVersionCompressionProgress | null;
  compressionProgressLabel: string;
};

export function FloatingVersionStorageToast({
  compressionProgress,
  compressionProgressLabel,
}: FloatingVersionStorageToastProps) {
  if (!compressionProgress) {
    return null;
  }

  const processedBytes = Number(compressionProgress.processedBytes ?? 0);
  const totalBytes = Number(compressionProgress.totalBytes ?? 0);
  const hasByteProgress = Number.isFinite(processedBytes) && Number.isFinite(totalBytes) && totalBytes > 0;

  return (
    <aside className="floating-version-storage" role="status" aria-live="polite">
      <p className="floating-version-storage__title">{compressionProgressLabel}</p>
      <p className="floating-version-storage__body">{compressionProgress.gameName} - {compressionProgress.versionName}</p>
      {hasByteProgress ? (
        <p className="floating-version-storage__bytes">
          {formatByteSize(processedBytes)} / {formatByteSize(totalBytes)}
        </p>
      ) : null}
      <div className="floating-version-storage__meter" aria-hidden="true">
        <span
          className="floating-version-storage__meter-fill"
          style={{ transform: `scaleX(${Math.max(0, Math.min(1, compressionProgress.percent))})` }}
        />
      </div>
    </aside>
  );
}
