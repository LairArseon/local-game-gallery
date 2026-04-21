/**
 * Shared scan orchestration core for App refresh flows.
 *
 * This module centralizes scan execution behavior used by App hooks in multiple
 * clients: in-flight deduplication, mode-specific mirror policy, status/logging,
 * and optional single-game refresh updates.
 */
import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';

export type RefreshScanMode = 'scan-only' | 'scan-and-sync' | 'parity-sync' | 'fallback-recovery-probe';

type RefreshScanOptions = {
  allowDestructiveMirrorChanges?: boolean;
};

type ScanResultLike<TGame extends { path: string; name: string; sizeBytes?: number | null }> = {
  games: TGame[];
  warnings: string[];
  usingMirrorFallback: boolean;
};

type UseScanRefreshCoreArgs<TGame extends { path: string; name: string }, TScanResult extends ScanResultLike<TGame>> = {
  scanGames: (options?: { syncMirror?: boolean; mirrorParity?: boolean; allowDestructiveMirrorChanges?: boolean }) => Promise<TScanResult>;
  emptyScan: TScanResult;
  t: (key: string, options?: Record<string, unknown>) => string;
  setScanResult: Dispatch<SetStateAction<TScanResult>>;
  setStatus: Dispatch<SetStateAction<string>>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
  setIsScanning?: Dispatch<SetStateAction<boolean>>;
  setScanProgress?: Dispatch<SetStateAction<number>>;
};

export function useScanRefreshCore<
  TGame extends { path: string; name: string; sizeBytes?: number | null },
  TScanResult extends ScanResultLike<TGame>,
>({
  scanGames,
  emptyScan,
  t,
  setScanResult,
  setStatus,
  logAppEvent,
  toErrorMessage,
  setIsScanning,
  setScanProgress,
}: UseScanRefreshCoreArgs<TGame, TScanResult>) {
  const scanInFlightRef = useRef<Promise<TScanResult | null> | null>(null);
  const refreshScanRef = useRef<((mode?: RefreshScanMode, options?: RefreshScanOptions) => Promise<TScanResult | null>) | null>(null);

  const refreshScan = useCallback(async (mode: RefreshScanMode = 'scan-and-sync', options: RefreshScanOptions = {}) => {
    if (scanInFlightRef.current) {
      return scanInFlightRef.current;
    }

    const isFallbackRecoveryProbe = mode === 'fallback-recovery-probe';
    const shouldSyncMirror = mode === 'scan-and-sync' || mode === 'parity-sync';
    const shouldMirrorParity = mode === 'parity-sync';
    const shouldAllowDestructiveMirrorChanges = shouldMirrorParity && options.allowDestructiveMirrorChanges === true;
    if (!isFallbackRecoveryProbe) {
      setScanProgress?.(0.06);
    }

    const startedAtMs = Date.now();
    const scanPromise = (async () => {
      if (!isFallbackRecoveryProbe) {
        setIsScanning?.(true);
        void logAppEvent(
          `Scan started (mode=${mode}, sync=${shouldSyncMirror ? 'enabled' : 'disabled'}, parity=${shouldAllowDestructiveMirrorChanges ? 'full' : 'safe-media-preserve'}).`,
          'info',
          'scan-orchestrator',
        );
      }

      try {
        const result = await scanGames({
          syncMirror: shouldSyncMirror,
          mirrorParity: shouldMirrorParity,
          allowDestructiveMirrorChanges: shouldAllowDestructiveMirrorChanges,
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

        setScanResult((current) => {
          const previousSizeByPath = new Map(
            current.games.map((game) => [game.path, game.sizeBytes ?? null]),
          );
          const mergedGames = result.games.map((game) => ({
            ...game,
            sizeBytes: game.sizeBytes ?? previousSizeByPath.get(game.path) ?? null,
          }));

          return {
            ...result,
            games: mergedGames,
          };
        });
        setStatus(result.games.length ? t('status.foundGameFolders', { count: result.games.length }) : t('status.scanCompletedNoMatches'));

        const elapsedMs = Date.now() - startedAtMs;
        const completionLevel = result.warnings.length ? 'warn' : 'info';
        void logAppEvent(
          `Scan completed in ${elapsedMs}ms (mode=${mode}, games=${result.games.length}, warnings=${result.warnings.length}, parity=${shouldAllowDestructiveMirrorChanges ? 'full' : 'safe-media-preserve'}).`,
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

        setScanResult(emptyScan);
        const logMessage = toErrorMessage(error, 'Failed to scan game folders.');
        const elapsedMs = Date.now() - startedAtMs;
        setStatus(t('status.failedScanGameFolders'));
        void logAppEvent(`${logMessage} (after ${elapsedMs}ms)`, 'error', 'scan-games');
        return null;
      } finally {
        scanInFlightRef.current = null;
        if (!isFallbackRecoveryProbe) {
          setIsScanning?.(false);
        }
      }
    })();

    scanInFlightRef.current = scanPromise;
    return scanPromise;
  }, [scanGames, emptyScan, t, setScanResult, setStatus, logAppEvent, toErrorMessage, setIsScanning, setScanProgress]);

  refreshScanRef.current = refreshScan;

  return {
    refreshScan,
    refreshScanRef,
  };
}

type UseRefreshGameCoreArgs<TGame extends { path: string; name: string }, TScanResult extends { scannedAt: string; games: TGame[] }> = {
  scanGame: (gamePath: string) => Promise<TGame | null | undefined>;
  setScanResult: Dispatch<SetStateAction<TScanResult>>;
  refreshScan: (mode?: RefreshScanMode, options?: RefreshScanOptions) => Promise<TScanResult | null>;
  toErrorMessage: (error: unknown, fallback: string) => string;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
};

export function useRefreshGameCore<TGame extends { path: string; name: string; sizeBytes?: number | null }, TScanResult extends { scannedAt: string; games: TGame[] }>({
  scanGame,
  setScanResult,
  refreshScan,
  toErrorMessage,
  logAppEvent,
}: UseRefreshGameCoreArgs<TGame, TScanResult>) {
  return useCallback(async (gamePath: string) => {
    const resolvedGamePath = String(gamePath ?? '').trim();
    if (!resolvedGamePath) {
      return null;
    }

    try {
      const refreshedGame = await scanGame(resolvedGamePath);

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
        const previousSize = index >= 0 ? nextGames[index]?.sizeBytes ?? null : null;
        const mergedGame = {
          ...refreshedGame,
          sizeBytes: refreshedGame.sizeBytes ?? previousSize ?? null,
        };

        if (index >= 0) {
          nextGames[index] = mergedGame;
        } else {
          nextGames.push(mergedGame);
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
  }, [logAppEvent, refreshScan, scanGame, setScanResult, toErrorMessage]);
}

export type ScanRefreshRef<TGame extends { path: string; name: string; sizeBytes?: number | null }, TScanResult extends ScanResultLike<TGame>> =
  MutableRefObject<((mode?: RefreshScanMode) => Promise<TScanResult | null>) | null>;
