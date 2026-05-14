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
    launchExecutable?: string;
  };
  versions: VersionSummaryLike[];
};

export type PlayGamePayload = {
  gamePath: string;
  gameName: string;
  versions: VersionSummaryLike[];
  launchMode: 'default' | 'choose-version-temporary';
  skipDecompressPrompt: boolean;
  explicitExecutablePath?: string;
};

export type LaunchGameCandidate = {
  versionName: string;
  versionPath: string;
  executableName: string;
  executablePath: string;
  relativeExecutablePath: string;
  storedExecutablePath: string;
  storageState: 'compressed' | 'decompressed';
  requiresDecompression: boolean;
};

export type ListLaunchCandidatesPayload = {
  gamePath: string;
  gameName: string;
  versions: VersionSummaryLike[];
  versionPaths?: string[];
};

export type ListLaunchCandidatesResult = {
  candidates: LaunchGameCandidate[];
  message: string;
};

export type PlayGameResult = {
  message: string;
  launched: boolean;
};

export type OpenFolderResult = {
  message: string;
};

export type GameActionsClientLike = {
  listLaunchCandidates: (payload: ListLaunchCandidatesPayload) => Promise<ListLaunchCandidatesResult>;
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
  confirmExecutableChoice?: (context: {
    gameName: string;
    reason: 'choose-version-temporary' | 'resolve-version-mismatch';
    candidates: LaunchGameCandidate[];
  }) => Promise<LaunchGameCandidate | null>;
  listLaunchCandidates: GameActionsClientLike['listLaunchCandidates'];
  playGame: GameActionsClientLike['playGame'];
  openFolder: GameActionsClientLike['openFolder'];
};
