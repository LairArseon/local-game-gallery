import { useRef, type Dispatch, type SetStateAction } from 'react';
import type { GameSummary, ScanResult } from '../types';

export type RefreshScanMode = 'scan-only' | 'scan-and-sync' | 'parity-sync' | 'fallback-recovery-probe';

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
  const scanInFlightRef = useRef<Promise<ScanResult | null> | null>(null);
  const refreshScanRef = useRef<((mode?: RefreshScanMode) => Promise<ScanResult | null>) | null>(null);

  async function refreshScan(mode: RefreshScanMode = 'scan-and-sync') {
    if (scanInFlightRef.current) {
      return scanInFlightRef.current;
    }

    const isFallbackRecoveryProbe = mode === 'fallback-recovery-probe';
    const shouldSyncMirror = mode === 'scan-and-sync' || mode === 'parity-sync';
    const shouldMirrorParity = mode === 'parity-sync';
    if (!isFallbackRecoveryProbe) {
      setScanProgress(0.06);
    }

    // Central scan gateway used by setup save, manual refresh, and post-action sync.
    const startedAtMs = Date.now();
    const scanPromise = (async () => {
      if (!isFallbackRecoveryProbe) {
        setIsScanning(true);
        void logAppEvent(
          `Scan started (mode=${mode}, sync=${shouldSyncMirror ? 'enabled' : 'disabled'}, parity=${shouldMirrorParity ? 'full' : 'safe-media-preserve'}).`,
          'info',
          'scan-orchestrator',
        );
      }

      try {
        const result = await galleryClient.scanGames({
          syncMirror: shouldSyncMirror,
          mirrorParity: shouldMirrorParity,
        });

        if (isFallbackRecoveryProbe) {
          if (!result.usingMirrorFallback) {
            setScanResult(result);
            setStatus(result.games.length ? t('status.foundGameFolders', { count: result.games.length }) : t('status.scanCompletedNoMatches'));
            void logAppEvent(
              `Primary game folder recovered automatically (games=${result.games.length}).`,
              'info',
              'fallback-probe',
            );
          }

          return result;
        }

        setScanResult(result);
        setStatus(result.games.length ? t('status.foundGameFolders', { count: result.games.length }) : t('status.scanCompletedNoMatches'));

        const elapsedMs = Date.now() - startedAtMs;
        const completionLevel = result.warnings.length ? 'warn' : 'info';
        void logAppEvent(
          `Scan completed in ${elapsedMs}ms (mode=${mode}, games=${result.games.length}, warnings=${result.warnings.length}, parity=${shouldMirrorParity ? 'full' : 'safe-media-preserve'}).`,
          completionLevel,
          'scan-orchestrator',
        );

        for (const warning of result.warnings) {
          void logAppEvent(warning, 'warn', 'scan-warning');
        }

        return result;
      } catch (error) {
        if (isFallbackRecoveryProbe) {
          return null;
        }

        // Reset to empty snapshot so stale scan data is not shown after failures.
        setScanResult(emptyScan);
        const logMessage = toErrorMessage(error, 'Failed to scan game folders.');
        const elapsedMs = Date.now() - startedAtMs;
        setStatus(t('status.failedScanGameFolders'));
        void logAppEvent(`${logMessage} (after ${elapsedMs}ms)`, 'error', 'scan-games');
        return null;
      } finally {
        scanInFlightRef.current = null;
        if (!isFallbackRecoveryProbe) {
          setIsScanning(false);
        }
      }
    })();

    scanInFlightRef.current = scanPromise;
    return scanPromise;
  }

  async function refreshGame(gamePath: string) {
    const resolvedGamePath = String(gamePath ?? '').trim();
    if (!resolvedGamePath) {
      return null;
    }

    try {
      const refreshedGame = await galleryClient.scanGame(resolvedGamePath);

      setScanResult((current) => {
        const existingGames = current.games;

        if (!refreshedGame) {
          if (!existingGames.some((game) => game.path === resolvedGamePath)) {
            return current;
          }

          return {
            ...current,
            scannedAt: new Date().toISOString(),
            games: existingGames.filter((game) => game.path !== resolvedGamePath),
          };
        }

        const nextGames = [...existingGames];
        const index = nextGames.findIndex((game) => game.path === refreshedGame.path);
        if (index >= 0) {
          nextGames[index] = refreshedGame;
        } else {
          nextGames.push(refreshedGame);
        }

        nextGames.sort((left, right) => left.name.localeCompare(right.name));

        return {
          ...current,
          scannedAt: new Date().toISOString(),
          games: nextGames,
        };
      });

      return refreshedGame;
    } catch (error) {
      const logMessage = toErrorMessage(error, 'Single game refresh failed.');
      void logAppEvent(logMessage, 'warn', 'scan-single-game');
      return null;
    }
  }

  refreshScanRef.current = refreshScan;

  return {
    refreshScan,
    refreshGame,
    refreshScanRef,
  };
}
