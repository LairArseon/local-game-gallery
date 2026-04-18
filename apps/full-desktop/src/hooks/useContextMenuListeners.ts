import { type Dispatch, type SetStateAction } from 'react';
import { useGalleryClient } from '../client/context';
import { useContextMenuListeners as useSharedContextMenuListeners } from '../../../shared/app-shell/hooks/useContextMenuListeners';
import type { GameSummary } from '../types';

type UseContextMenuListenersArgs = {
  games: GameSummary[];
  canLaunch: boolean;
  launchBlockedMessage?: string | null;
  isVaultOpen: boolean;
  openGameDetailFromPath: (gamePath: string) => void;
  openFolderInExplorer: (folderPath: string) => Promise<unknown>;
  openMetadataModal: (gamePath: string) => void;
  openPicturesModal: (gamePath: string) => void;
  playGame: (game: GameSummary) => Promise<unknown>;
  toggleGameVaultMembership: (gamePath: string, shouldBeVaulted: boolean) => Promise<unknown>;
  openVaultPinEditor: () => void;
  removeVaultPin: () => Promise<unknown>;
  onCompressVersion: (versionPath: string) => Promise<void>;
  onDecompressVersion: (versionPath: string) => Promise<void>;
  setStatus: Dispatch<SetStateAction<string>>;
};

export function useContextMenuListeners(args: UseContextMenuListenersArgs) {
  const galleryClient = useGalleryClient();
  useSharedContextMenuListeners<GameSummary>({
    galleryClient,
    ...args,
  });
}
