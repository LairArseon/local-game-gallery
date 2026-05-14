import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { GameSummary, ScanProgressEvent, ScanResult } from '../types';
import {
  useRefreshGameCore,
  useScanRefreshCore,
  type RefreshScanMode,
} from '../../../shared/app-shell/hooks/useScanOrchestratorCore';
import { formatScanProgressLabel } from '../../../shared/app-shell/hooks/scanProgressLabels';

export type { RefreshScanMode };

type UseScanOrchestratorArgs = {
  galleryClient: {
    scanGames: (options?: {
      syncMirror?: boolean;
      mirrorParity?: boolean;
      allowDestructiveMirrorChanges?: boolean;
      operationId?: string;
    }) => Promise<ScanResult>;
    scanGame: (gamePath: string) => Promise<GameSummary | null>;
    onScanProgress?: (callback: (payload: ScanProgressEvent) => void) => () => void;
  };
  emptyScan: ScanResult;
  t: (key: string, options?: Record<string, unknown>) => string;
  setScanResult: Dispatch<SetStateAction<ScanResult>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setIsScanning: Dispatch<SetStateAction<boolean>>;
  setScanProgress: Dispatch<SetStateAction<number>>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
};

export function useScanOrchestrator({
  galleryClient,
  emptyScan,
  t,
  setScanResult,
  setStatus,
  setIsScanning,
  setScanProgress,
  logAppEvent,
  toErrorMessage,
}: UseScanOrchestratorArgs) {
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
  }, [galleryClient, setScanProgress]);

  const { refreshScan, refreshScanRef } = useScanRefreshCore({
    scanGames: galleryClient.scanGames,
    emptyScan,
    t,
    setScanResult,
    setStatus,
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
    logAppEvent,
    toErrorMessage,
  });

  const refreshGame = useRefreshGameCore({
    scanGame: galleryClient.scanGame,
    setScanResult,
    refreshScan,
    toErrorMessage,
    logAppEvent,
  });

  return {
    refreshScan,
    refreshGame,
    refreshScanRef,
    scanActivityLabel: scanProgressEvent
      ? formatScanProgressLabel(scanProgressEvent, t)
      : baseScanActivityLabel,
  };
}

