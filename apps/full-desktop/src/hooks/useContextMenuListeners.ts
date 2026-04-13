/**
 * Subscribes to Electron context-menu channels and routes actions into app handlers.
 *
 * This hook keeps IPC listener setup/cleanup out of App and ensures context-menu
 * actions map cleanly to existing view operations (open, play, metadata, media,
 * folder navigation). It also includes fallback status reporting when payloads
 * reference stale or missing game paths.
 *
 * New to this project: this hook is the renderer-side subscriber for menu IPC events; start here to map each context-menu action to its in-app behavior.
 */
import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { useGalleryClient } from '../client/context';
import type { GameSummary } from '../types';

type UseContextMenuListenersArgs = {
  games: GameSummary[];
  isVaultOpen: boolean;
  openGameDetailFromPath: (gamePath: string) => void;
  openFolderInExplorer: (folderPath: string) => Promise<unknown>;
  openMetadataModal: (gamePath: string) => void;
  openPicturesModal: (gamePath: string) => void;
  playGame: (game: GameSummary) => Promise<unknown>;
  toggleGameVaultMembership: (gamePath: string, shouldBeVaulted: boolean) => Promise<unknown>;
  openVaultPinEditor: () => void;
  removeVaultPin: () => Promise<unknown>;
  setStatus: Dispatch<SetStateAction<string>>;
};

export function useContextMenuListeners({
  games,
  isVaultOpen,
  openGameDetailFromPath,
  openFolderInExplorer,
  openMetadataModal,
  openPicturesModal,
  playGame,
  toggleGameVaultMembership,
  openVaultPinEditor,
  removeVaultPin,
  setStatus,
}: UseContextMenuListenersArgs) {
  const { t } = useTranslation();
  const galleryClient = useGalleryClient();

  useEffect(() => {
    // Route main game context-menu actions into the same handlers used by UI buttons.
    const dispose = galleryClient.onGameContextMenuAction((payload) => {
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

      if (payload.action === 'add-to-vault') {
        void toggleGameVaultMembership(payload.gamePath, true);
        return;
      }

      if (payload.action === 'remove-from-vault') {
        void toggleGameVaultMembership(payload.gamePath, false);
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
  }, [galleryClient, games, openGameDetailFromPath, openFolderInExplorer, openMetadataModal, openPicturesModal, playGame, setStatus, toggleGameVaultMembership]);

  useEffect(() => {
    // Version menu currently exposes folder-open only; keep isolated for future actions.
    const dispose = galleryClient.onVersionContextMenuAction((payload) => {
      if (payload.action === 'open-version-folder') {
        void openFolderInExplorer(payload.versionPath);
      }
    });

    return () => {
      dispose();
    };
  }, [galleryClient, openFolderInExplorer]);

  useEffect(() => {
    const dispose = galleryClient.onVaultContextMenuAction((payload) => {
      if (!isVaultOpen) {
        return;
      }

      if (payload.action === 'add-vault-pin' || payload.action === 'change-vault-pin') {
        openVaultPinEditor();
        return;
      }

      if (payload.action === 'remove-vault-pin') {
        void removeVaultPin();
      }
    });

    return () => {
      dispose();
    };
  }, [galleryClient, isVaultOpen, openVaultPinEditor, removeVaultPin]);
}






