/**
 * Version storage action orchestrator for App-facing handlers.
 *
 * This hook composes compression/decompression primitives with path-based lookup
 * helpers and targeted game refresh behavior after operations complete. It keeps
 * App focused on orchestration by returning ready-to-wire callbacks for cards,
 * detail actions, and context menus.
 *
 * New to this project: this hook is the bridge between useVersionStorage and
 * App event handlers; extend here when adding new version-level actions.
 */
import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { GalleryClient } from '../client/contracts';
import type { ScanResult } from '../types';
import { useVersionStorage } from './useVersionStorage';
import { useVersionStorageActionsCore } from '../../../shared/app-shell/hooks/useVersionStorageActionsCore';

type RefreshScanMode = 'scan-only' | 'scan-and-sync' | 'parity-sync' | 'fallback-recovery-probe';

type UseVersionStorageActionsArgs = {
  games: ScanResult['games'];
  galleryClient: GalleryClient;
  setScanResult: Dispatch<SetStateAction<ScanResult>>;
  refreshScan: (mode?: RefreshScanMode) => Promise<ScanResult | null>;
  setStatus: Dispatch<SetStateAction<string>>;
  t: (key: string, options?: Record<string, unknown>) => string;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
};

export function useVersionStorageActions({
  games,
  galleryClient,
  setScanResult,
  refreshScan,
  setStatus,
  t,
  logAppEvent,
}: UseVersionStorageActionsArgs) {
  const refreshSingleGame = useCallback(async (gamePath: string) => {
    try {
      const updatedGame = await galleryClient.scanGame(gamePath);
      if (!updatedGame) {
        await refreshScan('scan-only');
        return;
      }

      setScanResult((current) => {
        const currentIndex = current.games.findIndex((game) => game.path === updatedGame.path);
        if (currentIndex < 0) {
          return current;
        }

        const nextGames = [...current.games];
        nextGames[currentIndex] = updatedGame;
        return {
          ...current,
          scannedAt: new Date().toISOString(),
          games: nextGames,
        };
      });
    } catch {
      await refreshScan('scan-only');
    }
  }, [galleryClient, refreshScan, setScanResult]);

  const { compressVersion, decompressVersion, compressionProgress } = useVersionStorage({
    galleryClient,
    setStatus,
    t,
    logAppEvent,
    refreshGame: refreshSingleGame,
  });

  const {
    onCompressVersionByPath,
    onDecompressVersionByPath,
    decompressVersionForLaunch,
  } = useVersionStorageActionsCore({
    games,
    scanGame: galleryClient.scanGame,
    setScanResult,
    refreshScan,
    setStatus,
    t,
    compressVersion,
    decompressVersion,
    compressionProgress,
  });

  return {
    compressVersion,
    decompressVersion,
    compressionProgress,
    onCompressVersionByPath,
    onDecompressVersionByPath,
    decompressVersionForLaunch,
  };
}

