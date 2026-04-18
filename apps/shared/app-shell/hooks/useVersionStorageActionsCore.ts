/**
 * Shared core for version-storage App action wiring.
 *
 * This hook centralizes refresh-after-version-change behavior and path-based
 * version action handlers. App-specific wrappers provide concrete client/types
 * and compression/decompression implementations.
 */
import { useCallback, type Dispatch, type SetStateAction } from 'react';

type GameVersionRef = {
  path: string;
  name: string;
};

type GameRef = {
  path: string;
  name: string;
  versions: GameVersionRef[];
};

type ScanResultLike<TGame extends GameRef> = {
  scannedAt: string;
  games: TGame[];
};

type UseVersionStorageActionsCoreArgs<
  TGame extends GameRef,
  TScanResult extends ScanResultLike<TGame>,
  TCompressionProgress,
> = {
  games: TGame[];
  scanGame: (gamePath: string) => Promise<TGame | null | undefined>;
  setScanResult: Dispatch<SetStateAction<TScanResult>>;
  refreshScan: (mode?: 'scan-only' | 'scan-and-sync' | 'parity-sync' | 'fallback-recovery-probe') => Promise<TScanResult | null>;
  setStatus: Dispatch<SetStateAction<string>>;
  t: (key: string, options?: Record<string, unknown>) => string;
  compressVersion: (gamePath: string, gameName: string, versionPath: string, versionName: string) => Promise<void>;
  decompressVersion: (gamePath: string, gameName: string, versionPath: string, versionName: string) => Promise<void>;
  compressionProgress: TCompressionProgress | null;
};

export function useVersionStorageActionsCore<
  TGame extends GameRef,
  TScanResult extends ScanResultLike<TGame>,
  TCompressionProgress,
>({
  games,
  scanGame,
  setScanResult,
  refreshScan,
  setStatus,
  t,
  compressVersion,
  decompressVersion,
  compressionProgress,
}: UseVersionStorageActionsCoreArgs<TGame, TScanResult, TCompressionProgress>) {
  const refreshSingleGame = useCallback(async (gamePath: string) => {
    try {
      const updatedGame = await scanGame(gamePath);
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
  }, [refreshScan, scanGame, setScanResult]);

  const onCompressVersionByPath = useCallback(async (versionPath: string) => {
    const game = games.find((candidate) => candidate.versions.some((version) => version.path === versionPath));
    const version = game?.versions.find((candidate) => candidate.path === versionPath);
    if (!game || !version) {
      setStatus(t('status.unableFindSelectedGame'));
      return;
    }

    await compressVersion(game.path, game.name, version.path, version.name);
  }, [compressVersion, games, setStatus, t]);

  const onDecompressVersionByPath = useCallback(async (versionPath: string) => {
    const game = games.find((candidate) => candidate.versions.some((version) => version.path === versionPath));
    const version = game?.versions.find((candidate) => candidate.path === versionPath);
    if (!game || !version) {
      setStatus(t('status.unableFindSelectedGame'));
      return;
    }

    await decompressVersion(game.path, game.name, version.path, version.name);
  }, [decompressVersion, games, setStatus, t]);

  const decompressVersionForLaunch = useCallback(async (
    gamePath: string,
    gameName: string,
    versionPath: string,
    versionName: string,
  ) => {
    await decompressVersion(gamePath, gameName, versionPath, versionName);
  }, [decompressVersion]);

  return {
    refreshSingleGame,
    compressVersion,
    decompressVersion,
    compressionProgress,
    onCompressVersionByPath,
    onDecompressVersionByPath,
    decompressVersionForLaunch,
  };
}
