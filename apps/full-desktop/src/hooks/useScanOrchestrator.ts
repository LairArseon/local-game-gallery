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
import type { ScanResult } from '../types';
import {
  useRefreshGameCore,
  useScanRefreshCore,
  type RefreshScanMode,
} from '../../../shared/app-shell/hooks/useScanOrchestratorCore';

const fallbackRecoveryProbeIntervalMs = 12000;

type UseScanOrchestratorArgs = {
  galleryClient: GalleryClient;
  isUsingMirrorFallback: boolean;
  gamesRoot: string;
  setScanResult: Dispatch<SetStateAction<ScanResult>>;
  setStatus: Dispatch<SetStateAction<string>>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
  t: (key: string, options?: Record<string, unknown>) => string;
  emptyScan: ScanResult;
};

export function useScanOrchestrator({
  galleryClient,
  isUsingMirrorFallback,
  gamesRoot,
  setScanResult,
  setStatus,
  logAppEvent,
  toErrorMessage,
  t,
  emptyScan,
}: UseScanOrchestratorArgs) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  const { refreshScan, refreshScanRef } = useScanRefreshCore({
    scanGames: galleryClient.scanGames,
    emptyScan,
    t,
    setScanResult,
    setStatus,
    logAppEvent,
    toErrorMessage,
    setIsScanning,
    setScanProgress,
  });

  const refreshGame = useRefreshGameCore({
    scanGame: galleryClient.scanGame,
    setScanResult,
    refreshScan,
    toErrorMessage,
    logAppEvent,
  });

  useEffect(() => {
    if (!isScanning) {
      return;
    }

    const progressInterval = window.setInterval(() => {
      setScanProgress((current) => {
        if (current >= 0.94) {
          return current;
        }

        const easedNext = current + ((1 - current) * 0.08);
        return Math.min(easedNext, 0.94);
      });
    }, 180);

    return () => {
      window.clearInterval(progressInterval);
    };
  }, [isScanning]);

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
  };
}

