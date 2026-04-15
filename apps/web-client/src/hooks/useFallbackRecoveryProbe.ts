import { useEffect, type MutableRefObject } from 'react';
import type { RefreshScanMode } from './useScanOrchestrator';

type UseFallbackRecoveryProbeArgs = {
  isUsingMirrorFallback: boolean;
  gamesRoot: string | null | undefined;
  refreshScanRef: MutableRefObject<((mode?: RefreshScanMode) => Promise<unknown>) | null>;
  intervalMs: number;
};

export function useFallbackRecoveryProbe({
  isUsingMirrorFallback,
  gamesRoot,
  refreshScanRef,
  intervalMs,
}: UseFallbackRecoveryProbeArgs) {
  useEffect(() => {
    if (!isUsingMirrorFallback || !String(gamesRoot ?? '').trim()) {
      return;
    }

    const runFallbackRecoveryProbe = () => {
      const runScan = refreshScanRef.current;
      if (!runScan) {
        return;
      }

      void runScan('fallback-recovery-probe');
    };

    runFallbackRecoveryProbe();
    const probeInterval = window.setInterval(runFallbackRecoveryProbe, intervalMs);

    return () => {
      window.clearInterval(probeInterval);
    };
  }, [gamesRoot, intervalMs, isUsingMirrorFallback, refreshScanRef]);
}
