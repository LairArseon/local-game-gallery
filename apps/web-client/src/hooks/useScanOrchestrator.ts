import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { GameSummary, GalleryConfig, ScanProgressEvent, ScanResult } from '../types';
import {
  useRefreshGameCore,
  useScanRefreshCore,
  type RefreshScanMode,
} from '../../../shared/app-shell/hooks/useScanOrchestratorCore';
import { formatScanProgressLabel } from '../../../shared/app-shell/hooks/scanProgressLabels';
import { shouldSyncMetadataMirrorOnExplicitRefresh } from '../../../shared/app-shell/utils/metadataMirrorSync';

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
  config: GalleryConfig | null;
  emptyScan: ScanResult;
  t: (key: string, options?: Record<string, unknown>) => string;
  setScanResult: Dispatch<SetStateAction<ScanResult>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setIsScanning: Dispatch<SetStateAction<boolean>>;
  setScanProgress: Dispatch<SetStateAction<number>>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
  reloadConfigAfterSync?: () => Promise<void>;
};

export function useScanOrchestrator({
  galleryClient,
  config,
  emptyScan,
  t,
  setScanResult,
  setStatus,
  setIsScanning,
  setScanProgress,
  logAppEvent,
  toErrorMessage,
  reloadConfigAfterSync,
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

  const { refreshScan: refreshScanBase, refreshScanRef } = useScanRefreshCore({
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

  const refreshScan = useRef<typeof refreshScanBase>(async (mode, options) => refreshScanBase(mode, options));

  refreshScan.current = async (mode, options) => {
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
  };

  const refreshScanCallback = async (mode?: RefreshScanMode, options?: { allowDestructiveMirrorChanges?: boolean }) => {
    return refreshScan.current(mode, options);
  };

  const refreshGame = useRefreshGameCore({
    scanGame: galleryClient.scanGame,
    setScanResult,
    refreshScan: refreshScanCallback,
    toErrorMessage,
    logAppEvent,
  });

  return {
    refreshScan: refreshScanCallback,
    refreshGame,
    refreshScanRef,
    scanActivityLabel: scanProgressEvent
      ? formatScanProgressLabel(scanProgressEvent, t)
      : baseScanActivityLabel,
  };
}

