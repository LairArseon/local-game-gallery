/**
 * Scan lifecycle orchestrator for refresh modes and progress state.
 *
 * This hook centralizes scan execution policies: mode-specific mirror behavior,
 * in-flight request deduplication, UI progress animation, failure reset, and
 * periodic fallback recovery probing while mirror mode is active.
 *
 * New to this project: this is the scan control plane used by App actions;
 * start with refreshScan to follow all scan entry points.
 */
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { GalleryClient } from '../client/contracts';
import type { GalleryConfig, ScanProgressEvent, ScanResult } from '../types';
import {
  useRefreshGameCore,
  useScanRefreshCore,
  type RefreshScanMode,
} from '../../../shared/app-shell/hooks/useScanOrchestratorCore';
import { formatScanProgressLabel } from '../../../shared/app-shell/hooks/scanProgressLabels';
import { shouldSyncMetadataMirrorOnExplicitRefresh } from '../../../shared/app-shell/utils/metadataMirrorSync';

const fallbackRecoveryProbeIntervalMs = 12000;

type UseScanOrchestratorArgs = {
  galleryClient: GalleryClient;
  config: GalleryConfig | null;
  isUsingMirrorFallback: boolean;
  gamesRoot: string;
  setScanResult: Dispatch<SetStateAction<ScanResult>>;
  setStatus: Dispatch<SetStateAction<string>>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
  t: (key: string, options?: Record<string, unknown>) => string;
  emptyScan: ScanResult;
  reloadConfigAfterSync?: () => Promise<void>;
};

export function useScanOrchestrator({
  galleryClient,
  config,
  isUsingMirrorFallback,
  gamesRoot,
  setScanResult,
  setStatus,
  logAppEvent,
  toErrorMessage,
  t,
  emptyScan,
  reloadConfigAfterSync,
}: UseScanOrchestratorArgs) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [baseScanActivityLabel, setBaseScanActivityLabel] = useState<string | null>(null);
  const [scanProgressEvent, setScanProgressEvent] = useState<ScanProgressEvent | null>(null);
  const activeScanOperationIdRef = useRef<string | null>(null);

  useEffect(() => {
    const disposeProgressListener = galleryClient.onScanProgress?.((event) => {
      if (!activeScanOperationIdRef.current || event.operationId !== activeScanOperationIdRef.current) {
        return;
      }

      setScanProgressEvent(event);
      setScanProgress((current) => Math.max(current, Number(event.percent ?? 0)));
    });

    return () => {
      disposeProgressListener?.();
    };
  }, [galleryClient]);

  const { refreshScan: refreshScanBase, refreshScanRef } = useScanRefreshCore({
    scanGames: galleryClient.scanGames,
    emptyScan,
    t,
    setScanResult,
    setStatus,
    logAppEvent,
    toErrorMessage,
    setIsScanning,
    setScanProgress,
    setScanActivityLabel: setBaseScanActivityLabel,
    onScanOperationStart: (operationId) => {
      activeScanOperationIdRef.current = operationId;
      setScanProgressEvent(null);
    },
    onScanOperationEnd: (operationId) => {
      if (activeScanOperationIdRef.current === operationId) {
        activeScanOperationIdRef.current = null;
      }
      setScanProgressEvent(null);
    },
  });

  const refreshScan = useCallback(async (mode?: RefreshScanMode, options?: { allowDestructiveMirrorChanges?: boolean }) => {
    const resolvedMode = mode ?? (
      config?.metadataMirrorRoot.trim()
        ? (shouldSyncMetadataMirrorOnExplicitRefresh({
            policy: config.metadataMirrorSyncPolicy,
            interval: config.metadataMirrorSyncInterval,
            lastSyncedAt: config.lastMetadataMirrorSyncAt,
          }) ? 'scan-and-sync' : 'scan-only')
        : 'scan-only'
    );
    const result = await refreshScanBase(resolvedMode, options);
    if (
      result
      && !result.usingMirrorFallback
      && (resolvedMode === 'scan-and-sync' || resolvedMode === 'parity-sync')
    ) {
      await reloadConfigAfterSync?.();
    }

    return result;
  }, [config, refreshScanBase, reloadConfigAfterSync]);

  const refreshGame = useRefreshGameCore({
    scanGame: galleryClient.scanGame,
    setScanResult,
    refreshScan,
    toErrorMessage,
    logAppEvent,
  });

  useEffect(() => {
    if (isScanning || scanProgress <= 0) {
      return;
    }

    if (scanProgress < 1) {
      setScanProgress(1);
    }

    const resetDelay = window.setTimeout(() => {
      setScanProgress(0);
    }, 260);

    return () => {
      window.clearTimeout(resetDelay);
    };
  }, [isScanning, scanProgress]);

  useEffect(() => {
    if (!isUsingMirrorFallback || !gamesRoot.trim()) {
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
    const probeInterval = window.setInterval(runFallbackRecoveryProbe, fallbackRecoveryProbeIntervalMs);

    return () => {
      window.clearInterval(probeInterval);
    };
  }, [gamesRoot, isUsingMirrorFallback]);

  return {
    isScanning,
    scanProgress,
    refreshScan,
    refreshGame,
    scanActivityLabel: scanProgressEvent
      ? formatScanProgressLabel(scanProgressEvent, t)
      : baseScanActivityLabel,
  };
}

