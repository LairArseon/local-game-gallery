import type { Dispatch, SetStateAction } from 'react';
import type { GameSummary, ScanResult } from '../types';
import {
  useRefreshGameCore,
  useScanRefreshCore,
  type RefreshScanMode,
} from '../../../shared/app-shell/hooks/useScanOrchestratorCore';

export type { RefreshScanMode };

type UseScanOrchestratorArgs = {
  galleryClient: {
    scanGames: (options?: { syncMirror?: boolean; mirrorParity?: boolean }) => Promise<ScanResult>;
    scanGame: (gamePath: string) => Promise<GameSummary | null>;
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
  const { refreshScan, refreshScanRef } = useScanRefreshCore({
    scanGames: galleryClient.scanGames,
    emptyScan,
    t,
    setScanResult,
    setStatus,
    setIsScanning,
    setScanProgress,
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
  };
}

