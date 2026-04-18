/**
 * Floating progress toast for version storage operations.
 */
type SharedVersionCompressionProgress = {
  gameName: string;
  versionName: string;
  percent: number;
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

  return (
    <aside className="floating-version-storage" role="status" aria-live="polite">
      <p className="floating-version-storage__title">{compressionProgressLabel}</p>
      <p className="floating-version-storage__body">{compressionProgress.gameName} - {compressionProgress.versionName}</p>
      <div className="floating-version-storage__meter" aria-hidden="true">
        <span
          className="floating-version-storage__meter-fill"
          style={{ transform: `scaleX(${Math.max(0, Math.min(1, compressionProgress.percent))})` }}
        />
      </div>
    </aside>
  );
}
