/**
 * Centralizes high-frequency game actions triggered by cards, detail pages, and menus.
 *
 * The hook unifies play launch logic, detail selection flow, folder open actions,
 * and single-selection toggling. It also keeps status/log error handling aligned
 * across these paths so behavior stays predictable regardless of entry point.
 */
import type { Dispatch, MouseEvent, SetStateAction } from 'react';
import type { GameSummary } from '../types';

type UseGameActionsArgs = {
  games: GameSummary[];
  setStatus: Dispatch<SetStateAction<string>>;
  setDetailGamePath: Dispatch<SetStateAction<string | null>>;
  setSelectedGamePath: Dispatch<SetStateAction<string | null>>;
  refreshScan: () => Promise<unknown>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
};

export function useGameActions({
  games,
  setStatus,
  setDetailGamePath,
  setSelectedGamePath,
  refreshScan,
  logAppEvent,
  toErrorMessage,
}: UseGameActionsArgs) {
  function handlePlayClick(game: GameSummary, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    void playGame(game);
  }

  async function playGame(game: GameSummary) {
    try {
      const result = await window.gallery.playGame({
        gamePath: game.path,
        gameName: game.name,
        versions: game.versions.map((version) => ({
          name: version.name,
          path: version.path,
        })),
      });
      setStatus(result.message);
      // Refresh only when a launch actually happened (play call can also return no-op statuses).
      if (result.launched) {
        await refreshScan();
      }
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to launch game.');
      setStatus(message);
      void logAppEvent(message, 'error', 'play-game');
    }
  }

  function handleOpenDetail(game: GameSummary, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setDetailGamePath(game.path);
    setSelectedGamePath(game.path);
  }

  function openGameDetailFromPath(gamePath: string) {
    // Context-menu payloads can become stale after rescans; guard missing entries.
    const game = games.find((candidate) => candidate.path === gamePath);
    if (!game) {
      return;
    }

    setDetailGamePath(game.path);
    setSelectedGamePath(game.path);
  }

  async function openFolderInExplorer(folderPath: string) {
    try {
      const result = await window.gallery.openFolder({ folderPath });
      setStatus(result.message);
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to open folder.');
      setStatus(message);
      void logAppEvent(message, 'error', 'open-folder');
    }
  }

  function toggleGameSelection(path: string) {
    // Clicking the same card again collapses single-selection focus.
    setSelectedGamePath((current) => (current === path ? null : path));
  }

  return {
    handlePlayClick,
    playGame,
    handleOpenDetail,
    openGameDetailFromPath,
    openFolderInExplorer,
    toggleGameSelection,
  };
}
