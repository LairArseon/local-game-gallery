/**
 * App-level derived selector bundle for cross-feature view state.
 */
import { useMemo } from 'react';

type SharedGameSummary = {
  path: string;
  isVaulted?: boolean;
  media: {
    background: string | null;
  };
};

type SharedConfig = {
  tagPool: string[];
};

type SharedScanResult = {
  games: SharedGameSummary[];
};

type UseAppDerivedStateArgs<TGame extends SharedGameSummary, TConfig extends SharedConfig> = {
  isVaultOpen: boolean;
  visibleVersionMismatchGames: TGame[];
  config: TConfig | null;
  draftTagRules: string[];
  effectiveTagPoolUsage: Record<string, number>;
  isNarrowViewport: boolean;
  visibleFilteredGames: TGame[];
  selectedGamePath: string | null;
  scanResult: {
    games: TGame[];
  };
  detailGamePath: string | null;
};

export function useAppDerivedState<TGame extends SharedGameSummary, TConfig extends SharedConfig>({
  isVaultOpen,
  visibleVersionMismatchGames,
  config,
  draftTagRules,
  effectiveTagPoolUsage,
  isNarrowViewport,
  visibleFilteredGames,
  selectedGamePath,
  scanResult,
  detailGamePath,
}: UseAppDerivedStateArgs<TGame, TConfig>) {
  const vaultAwareVersionMismatchGames = useMemo(
    () => (isVaultOpen ? visibleVersionMismatchGames : visibleVersionMismatchGames.filter((game) => !game.isVaulted)),
    [isVaultOpen, visibleVersionMismatchGames],
  );

  const vaultAwareTopUsedFilterSuggestions = useMemo(() => {
    if (!config) {
      return [] as Array<{ tag: string; count: number }>;
    }

    const activeKeys = new Set(
      draftTagRules
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => (entry.startsWith('-') ? entry.slice(1).trim() : entry).toLowerCase()),
    );

    return config.tagPool
      .map((tag) => ({
        tag,
        count: Number.isFinite(effectiveTagPoolUsage[tag]) ? effectiveTagPoolUsage[tag] : 0,
      }))
      .filter((entry) => !activeKeys.has(entry.tag.toLowerCase()))
      .sort((left, right) => {
        if (left.count !== right.count) {
          return right.count - left.count;
        }

        return left.tag.localeCompare(right.tag, undefined, { sensitivity: 'base' });
      })
      .slice(0, 10);
  }, [config, draftTagRules, effectiveTagPoolUsage]);

  const selectedGame = useMemo(
    () => (isNarrowViewport ? null : visibleFilteredGames.find((game) => game.path === selectedGamePath) ?? null),
    [isNarrowViewport, visibleFilteredGames, selectedGamePath],
  );

  const detailGame = useMemo(() => {
    const game = scanResult.games.find((candidate) => candidate.path === detailGamePath) ?? null;
    if (!game) {
      return null;
    }

    return !isVaultOpen && game.isVaulted ? null : game;
  }, [scanResult.games, detailGamePath, isVaultOpen]);

  const detailBackgroundPath = detailGame?.media.background ?? null;
  const hideTopbarForDetail = isNarrowViewport && Boolean(detailGame);

  return {
    vaultAwareVersionMismatchGames,
    vaultAwareTopUsedFilterSuggestions,
    selectedGame,
    detailGame,
    detailBackgroundSrc: detailBackgroundPath,
    detailBackgroundPath,
    hideTopbarForDetail,
  };
}
