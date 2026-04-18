import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';

type GameSummaryLike = {
  path: string;
  isVaulted?: boolean;
};

type GalleryClientLike = {
  onGameContextMenuAction: (handler: (payload: { action: string; gamePath: string }) => void) => () => void;
  onVersionContextMenuAction: (handler: (payload: { action: string; versionPath: string }) => void) => () => void;
  onVaultContextMenuAction: (handler: (payload: { action: string }) => void) => () => void;
};

type UseContextMenuListenersArgs<TGame extends GameSummaryLike> = {
  galleryClient: GalleryClientLike;
  games: TGame[];
  canLaunch: boolean;
  launchBlockedMessage?: string | null;
  isVaultOpen: boolean;
  openGameDetailFromPath: (gamePath: string) => void;
  openFolderInExplorer: (folderPath: string) => Promise<unknown>;
  openMetadataModal: (gamePath: string) => void;
  openPicturesModal: (gamePath: string) => void;
  playGame: (game: TGame) => Promise<unknown>;
  toggleGameVaultMembership: (gamePath: string, shouldBeVaulted: boolean) => Promise<unknown>;
  openVaultPinEditor: () => void;
  removeVaultPin: () => Promise<unknown>;
  onCompressVersion: (versionPath: string) => Promise<void>;
  onDecompressVersion: (versionPath: string) => Promise<void>;
  setStatus: Dispatch<SetStateAction<string>>;
};

export function useContextMenuListeners<TGame extends GameSummaryLike>({
  galleryClient,
  games,
  canLaunch,
  launchBlockedMessage,
  isVaultOpen,
  openGameDetailFromPath,
  openFolderInExplorer,
  openMetadataModal,
  openPicturesModal,
  playGame,
  toggleGameVaultMembership,
  openVaultPinEditor,
  removeVaultPin,
  onCompressVersion,
  onDecompressVersion,
  setStatus,
}: UseContextMenuListenersArgs<TGame>) {
  const { t } = useTranslation();

  useEffect(() => {
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

      if (payload.action === 'play') {
        if (!canLaunch) {
          if (launchBlockedMessage) {
            setStatus(launchBlockedMessage);
          }
          return;
        }

        const game = games.find((candidate) => candidate.path === payload.gamePath);
        if (game) {
          void playGame(game);
          return;
        }

        setStatus(t('status.unableFindSelectedGame'));
      }
    });

    return () => {
      dispose();
    };
  }, [canLaunch, galleryClient, games, launchBlockedMessage, openGameDetailFromPath, openFolderInExplorer, openMetadataModal, openPicturesModal, playGame, setStatus, toggleGameVaultMembership, t]);

  useEffect(() => {
    const dispose = galleryClient.onVersionContextMenuAction((payload) => {
      if (payload.action === 'open-version-folder') {
        void openFolderInExplorer(payload.versionPath);
        return;
      }

      if (payload.action === 'compress-version') {
        void onCompressVersion(payload.versionPath);
        return;
      }

      if (payload.action === 'decompress-version') {
        void onDecompressVersion(payload.versionPath);
      }
    });

    return () => {
      dispose();
    };
  }, [galleryClient, onCompressVersion, onDecompressVersion, openFolderInExplorer]);

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
