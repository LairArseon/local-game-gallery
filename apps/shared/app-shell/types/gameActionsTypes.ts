/**
 * Shared type contracts for game action orchestration.
 */
import type { Dispatch, SetStateAction } from 'react';

export type VersionSummaryLike = {
  name: string;
  path: string;
  storageState: 'compressed' | 'decompressed';
  storageArchivePath?: string | null;
};

export type GameSummaryLike = {
  path: string;
  name: string;
  detectedLatestVersion: string;
  metadata: {
    latestVersion: string;
  };
  versions: VersionSummaryLike[];
};

export type PlayGamePayload = {
  gamePath: string;
  gameName: string;
  versions: VersionSummaryLike[];
  launchMode: 'default' | 'choose-version-temporary';
  skipDecompressPrompt: boolean;
};

export type PlayGameResult = {
  message: string;
  launched: boolean;
};

export type OpenFolderResult = {
  message: string;
};

export type GameActionsClientLike = {
  playGame: (payload: PlayGamePayload) => Promise<PlayGameResult>;
  openFolder: (payload: { folderPath: string }) => Promise<OpenFolderResult>;
};

export type UseGameActionsCoreArgs<TGame extends GameSummaryLike> = {
  games: TGame[];
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
  playGame: GameActionsClientLike['playGame'];
  openFolder: GameActionsClientLike['openFolder'];
};
