/**
 * Centralizes high-frequency game actions triggered by cards, detail pages, and menus.
 *
 * The hook unifies play launch logic, detail selection flow, folder open actions,
 * and single-selection toggling. It also keeps status/log error handling aligned
 * across these paths so behavior stays predictable regardless of entry point.
 *
 * New to this project: this hook centralizes play/open/folder/selection actions; start with runPlayGame to trace launch payloads into Electron play IPC.
 */
import type { Dispatch, SetStateAction } from 'react';
import { useGalleryClient } from '../client/context';
import type { GameSummary } from '../types';
import { useGameActionsCore } from '../../../shared/app-shell/hooks/useGameActionsCore';

type UseGameActionsArgs = {
  games: GameSummary[];
  canLaunch: boolean;
  launchBlockedMessage?: string | null;
  setStatus: Dispatch<SetStateAction<string>>;
  setDetailGamePath: Dispatch<SetStateAction<string | null>>;
  setSelectedGamePath: Dispatch<SetStateAction<string | null>>;
  refreshScan: () => Promise<unknown>;
  confirmDecompressBeforeLaunch?: (gameName: string, versionName: string) => Promise<boolean>;
  decompressVersionBeforeLaunch?: (gamePath: string, gameName: string, versionPath: string, versionName: string) => Promise<void>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
};

export function useGameActions({
  games,
  canLaunch,
  launchBlockedMessage,
  setStatus,
  setDetailGamePath,
  setSelectedGamePath,
  refreshScan,
  confirmDecompressBeforeLaunch,
  decompressVersionBeforeLaunch,
  logAppEvent,
  toErrorMessage,
}: UseGameActionsArgs) {
  const galleryClient = useGalleryClient();

  return useGameActionsCore<GameSummary>({
    games,
    canLaunch,
    launchBlockedMessage,
    setStatus,
    setDetailGamePath,
    setSelectedGamePath,
    refreshScan,
    confirmDecompressBeforeLaunch,
    decompressVersionBeforeLaunch,
    logAppEvent,
    toErrorMessage,
    playGame: (payload) => galleryClient.playGame(payload),
    openFolder: (payload) => galleryClient.openFolder(payload),
  });
}







