/**
 * Subscribes to Electron context-menu channels and routes actions into app handlers.
 *
 * This hook keeps IPC listener setup/cleanup out of App and ensures context-menu
 * actions map cleanly to existing view operations (open, play, metadata, media,
 * folder navigation). It also includes fallback status reporting when payloads
 * reference stale or missing game paths.
 */
import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameSummary } from '../types';

type UseContextMenuListenersArgs = {
  games: GameSummary[];
  openGameDetailFromPath: (gamePath: string) => void;
  openFolderInExplorer: (folderPath: string) => Promise<unknown>;
  openMetadataModal: (gamePath: string) => void;
  openPicturesModal: (gamePath: string) => void;
  playGame: (game: GameSummary) => Promise<unknown>;
  setStatus: Dispatch<SetStateAction<string>>;
};

export function useContextMenuListeners({
  games,
  openGameDetailFromPath,
  openFolderInExplorer,
  openMetadataModal,
  openPicturesModal,
  playGame,
  setStatus,
}: UseContextMenuListenersArgs) {
  const { t } = useTranslation();

  useEffect(() => {
    // Route main game context-menu actions into the same handlers used by UI buttons.
    const dispose = window.gallery.onGameContextMenuAction((payload) => {
      if (payload.action === 'open') {
        openGameDetailFromPath(payload.gamePath);
        return;
      }

      if (payload.action === 'open-game-folder') {
        void openFolderInExplorer(payload.gamePath);
        return;
      }

      if (payload.action === 'edit-metadata') {
        openMetadataModal(payload.gamePath);
        return;
      }

      if (payload.action === 'manage-pictures') {
        openPicturesModal(payload.gamePath);
        return;
      }

      // For any launch-like action, resolve against current list to avoid stale paths.
      const game = games.find((candidate) => candidate.path === payload.gamePath);
      if (game) {
        void playGame(game);
        return;
      }

      // Surface stale payloads (e.g., list changed after menu opened) to the user.
      setStatus(t('status.unableFindSelectedGame'));
    });

    return () => {
      dispose();
    };
  }, [games, openGameDetailFromPath, openFolderInExplorer, openMetadataModal, openPicturesModal, playGame, setStatus]);

  useEffect(() => {
    // Version menu currently exposes folder-open only; keep isolated for future actions.
    const dispose = window.gallery.onVersionContextMenuAction((payload) => {
      if (payload.action === 'open-version-folder') {
        void openFolderInExplorer(payload.versionPath);
      }
    });

    return () => {
      dispose();
    };
  }, [openFolderInExplorer]);
}
