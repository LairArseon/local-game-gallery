import { useEffect, useMemo, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { TFunction } from 'i18next';
import type { LaunchGameCandidate, VersionSummaryLike } from '../types/gameActionsTypes';
import type { NotificationFeedAction, NotificationFeedItem } from '../types';

type GalleryClientLike<TConfig, TMetadata> = {
  saveConfig: (config: TConfig) => Promise<unknown>;
  saveGameMetadata: (payload: {
    gamePath: string;
    title: string;
    metadata: TMetadata;
  }) => Promise<unknown>;
  listLaunchCandidates: (payload: {
    gamePath: string;
    gameName: string;
    versions: VersionSummaryLike[];
    versionPaths?: string[];
  }) => Promise<{
    candidates: LaunchGameCandidate[];
    message: string;
  }>;
};

type VersionMismatchGameLike<TMetadata> = {
  path: string;
  name: string;
  hasVersionMismatch: boolean;
  isVersionMismatchDismissed: boolean;
  detectedLatestVersion: string;
  metadata: TMetadata;
  versions: VersionSummaryLike[];
};

type MetadataWithLaunchExecutable = {
  latestVersion?: string;
  launchExecutable?: string;
};

type LaunchExecutableResolutionStatus = 'selected' | 'cleared' | 'canceled';

type LaunchExecutableResolutionResult = {
  status: LaunchExecutableResolutionStatus;
  launchExecutable: string;
};

type ScanResultLike<TGame> = {
  games: TGame[];
};

type VersionMismatchConfigLike = {
  dismissedVersionMismatches?: Record<string, string>;
};

type UseVersionMismatchManagerArgs<
  TConfig extends VersionMismatchConfigLike,
  TGame extends VersionMismatchGameLike<TMetadata>,
  TMetadata,
> = {
  galleryClient: GalleryClientLike<TConfig, TMetadata>;
  config: TConfig | null;
  setConfig: Dispatch<SetStateAction<TConfig | null>>;
  scanResult: ScanResultLike<TGame>;
  setStatus: Dispatch<SetStateAction<string>>;
  refreshScan: () => Promise<unknown>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
  t: TFunction;
  setDetailGamePath: Dispatch<SetStateAction<string | null>>;
  setSelectedGamePath: Dispatch<SetStateAction<string | null>>;
  cardsContainerRef: RefObject<HTMLDivElement | null>;
  confirmExecutableChoice?: (context: {
    gameName: string;
    reason: 'choose-version-temporary' | 'resolve-version-mismatch';
    candidates: LaunchGameCandidate[];
  }) => Promise<LaunchGameCandidate | null>;
};

function normalizePathForMatch(value: string | null | undefined) {
  return String(value ?? '').replace(/\\/g, '/').trim().toLowerCase();
}

function findEquivalentLaunchCandidate(storedExecutablePath: string | null | undefined, candidates: LaunchGameCandidate[]) {
  const normalizedStoredPath = normalizePathForMatch(storedExecutablePath);
  if (!normalizedStoredPath) {
    return null;
  }

  const exactStoredMatch = candidates.find((candidate) => normalizePathForMatch(candidate.storedExecutablePath) === normalizedStoredPath);
  if (exactStoredMatch) {
    return exactStoredMatch;
  }

  const exactRelativeMatch = candidates.find((candidate) => normalizePathForMatch(candidate.relativeExecutablePath) === normalizedStoredPath);
  if (exactRelativeMatch) {
    return exactRelativeMatch;
  }

  const suffixMatches = candidates.filter((candidate) => {
    const normalizedRelativePath = normalizePathForMatch(candidate.relativeExecutablePath);
    return normalizedStoredPath === normalizedRelativePath || normalizedStoredPath.endsWith(`/${normalizedRelativePath}`);
  });

  return suffixMatches.length === 1 ? suffixMatches[0] : null;
}

export async function resolveLatestVersionLaunchExecutable<
  TGame extends VersionMismatchGameLike<TMetadata>,
  TMetadata,
>({
  galleryClient,
  targetGame,
  detectedVersion,
  confirmExecutableChoice,
}: {
  galleryClient: Pick<GalleryClientLike<VersionMismatchConfigLike, TMetadata>, 'listLaunchCandidates'>;
  targetGame: TGame;
  detectedVersion: string;
  confirmExecutableChoice?: (context: {
    gameName: string;
    reason: 'choose-version-temporary' | 'resolve-version-mismatch';
    candidates: LaunchGameCandidate[];
  }) => Promise<LaunchGameCandidate | null>;
}): Promise<LaunchExecutableResolutionResult> {
  const metadata = targetGame.metadata as MetadataWithLaunchExecutable;
  const nextVersion = targetGame.versions.find((version) => version.name === detectedVersion);
  if (!nextVersion) {
    return {
      status: 'cleared',
      launchExecutable: '',
    };
  }

  const candidateResult = await galleryClient.listLaunchCandidates({
    gamePath: targetGame.path,
    gameName: targetGame.name,
    versions: targetGame.versions.map((version) => ({
      name: version.name,
      path: version.path,
      storageState: version.storageState,
      storageArchivePath: version.storageArchivePath,
    })),
    versionPaths: [nextVersion.path],
  });

  if (candidateResult.candidates.length === 1) {
    return {
      status: 'selected',
      launchExecutable: candidateResult.candidates[0]?.storedExecutablePath ?? '',
    };
  }

  if (candidateResult.candidates.length > 1) {
    const remappedCandidate = findEquivalentLaunchCandidate(metadata.launchExecutable, candidateResult.candidates);
    if (remappedCandidate) {
      return {
        status: 'selected',
        launchExecutable: remappedCandidate.storedExecutablePath,
      };
    }

    const selectedCandidate = confirmExecutableChoice
      ? await confirmExecutableChoice({
        gameName: targetGame.name,
        reason: 'resolve-version-mismatch',
        candidates: candidateResult.candidates,
      })
      : null;

    if (!selectedCandidate) {
      return {
        status: 'canceled',
        launchExecutable: '',
      };
    }

    return {
      status: 'selected',
      launchExecutable: selectedCandidate.storedExecutablePath,
    };
  }

  return {
    status: 'cleared',
    launchExecutable: '',
  };
}

export function useVersionMismatchManager<
  TConfig extends VersionMismatchConfigLike,
  TGame extends VersionMismatchGameLike<TMetadata>,
  TMetadata,
>({
  galleryClient,
  config,
  setConfig,
  scanResult,
  setStatus,
  refreshScan,
  logAppEvent,
  toErrorMessage,
  t,
  setDetailGamePath,
  setSelectedGamePath,
  cardsContainerRef,
  confirmExecutableChoice,
}: UseVersionMismatchManagerArgs<TConfig, TGame, TMetadata>) {
  const [isVersionNotificationsOpen, setIsVersionNotificationsOpen] = useState(false);

  useEffect(() => {
    if (!isVersionNotificationsOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest('.topbar-notifications') || target.closest('.topbar-notification-button')) {
        return;
      }

      setIsVersionNotificationsOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isVersionNotificationsOpen]);

  const mismatchedGames = useMemo(
    () => scanResult.games.filter((game) => game.hasVersionMismatch),
    [scanResult.games],
  );

  const visibleVersionMismatchGames = useMemo(
    () => mismatchedGames.filter((game) => !game.isVersionMismatchDismissed),
    [mismatchedGames],
  );

  const versionNotificationFeedItems = useMemo<NotificationFeedItem[]>(
    () => visibleVersionMismatchGames.map((game) => ({
      id: `version-mismatch:${game.path}`,
      sourceId: game.path,
      sourceKind: 'version-mismatch',
      title: game.name,
      message: `${String((game.metadata as { latestVersion?: string }).latestVersion ?? '').trim() || t('detail.unknown')} -> ${String(game.detectedLatestVersion ?? '').trim() || t('detail.unknown')}`,
      createdAt: '1970-01-01T00:00:00.000Z',
      gamePath: game.path,
      severity: 'warn',
      dismissible: true,
      actions: [
        {
          id: `resolve:${game.path}`,
          label: t('versionMismatch.resolve'),
          kind: 'resolve',
          payload: {
            gamePath: game.path,
            gameName: game.name,
            detectedVersion: game.detectedLatestVersion,
          },
        },
        {
          id: `dismiss:${game.path}`,
          label: t('versionMismatch.dismiss'),
          kind: 'dismiss',
          payload: {
            gamePath: game.path,
            gameName: game.name,
            detectedVersion: game.detectedLatestVersion,
          },
        },
      ],
      metadata: {
        currentVersion: String((game.metadata as { latestVersion?: string }).latestVersion ?? '').trim(),
        detectedVersion: String(game.detectedLatestVersion ?? '').trim(),
      },
    })),
    [t, visibleVersionMismatchGames],
  );

  async function dismissVersionMismatch(gamePath: string, detectedVersion: string, gameName: string) {
    if (!config) {
      return;
    }

    const previousConfig = config;
    const nextConfig: TConfig = {
      ...config,
      dismissedVersionMismatches: {
        ...(config.dismissedVersionMismatches ?? {}),
        [gamePath]: detectedVersion,
      },
    };

    setConfig(nextConfig);

    try {
      await galleryClient.saveConfig(nextConfig);
      setStatus(t('status.versionMismatchDismissed', { game: gameName }));
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to dismiss version mismatch notification.');
      setStatus(message);
      void logAppEvent(message, 'error', 'dismiss-version-mismatch');
      setConfig(previousConfig);
    }
  }

  async function resolveVersionMismatch(gamePath: string, gameName: string, detectedVersion: string) {
    const targetGame = scanResult.games.find((game) => game.path === gamePath);
    if (!targetGame || !detectedVersion) {
      return;
    }

    try {
      const resolution = await resolveLatestVersionLaunchExecutable({
        galleryClient,
        targetGame,
        detectedVersion,
        confirmExecutableChoice,
      });

      if (resolution.status === 'canceled') {
        setStatus('Version update canceled.');
        return;
      }

      await galleryClient.saveGameMetadata({
        gamePath: targetGame.path,
        title: targetGame.name,
        metadata: {
          ...(targetGame.metadata as object),
          latestVersion: detectedVersion,
          launchExecutable: resolution.launchExecutable,
        } as TMetadata,
      });

      if (config?.dismissedVersionMismatches?.[gamePath]) {
        const nextDismissed = { ...config.dismissedVersionMismatches };
        delete nextDismissed[gamePath];
        const nextConfig: TConfig = {
          ...config,
          dismissedVersionMismatches: nextDismissed,
        };
        setConfig(nextConfig);
        await galleryClient.saveConfig(nextConfig);
      }

      await refreshScan();
      setStatus(t('status.versionMismatchResolved', { game: gameName, version: detectedVersion }));
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to update game latest version.');
      setStatus(message);
      void logAppEvent(message, 'error', 'resolve-version-mismatch');
    }
  }

  function focusGameFromNotification(gamePath: string) {
    setDetailGamePath(null);
    setSelectedGamePath(gamePath);
    setIsVersionNotificationsOpen(false);
    window.setTimeout(() => {
      const cards = cardsContainerRef.current?.querySelectorAll<HTMLElement>('[data-game-path]') ?? [];
      const targetCard = Array.from(cards).find((card) => card.dataset.gamePath === gamePath);
      targetCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  }

  async function handleNotificationFeedAction(item: NotificationFeedItem, action: NotificationFeedAction) {
    const actionGamePath = String(action.payload?.gamePath ?? item.gamePath ?? '').trim();
    const actionGameName = String(action.payload?.gameName ?? item.title ?? '').trim();
    const detectedVersion = String(action.payload?.detectedVersion ?? item.metadata?.detectedVersion ?? '').trim();

    if (action.kind === 'open-game' && actionGamePath) {
      focusGameFromNotification(actionGamePath);
      return;
    }

    if (action.kind === 'resolve' && actionGamePath && actionGameName && detectedVersion) {
      await resolveVersionMismatch(actionGamePath, actionGameName, detectedVersion);
      return;
    }

    if (action.kind === 'dismiss' && actionGamePath && actionGameName && detectedVersion) {
      await dismissVersionMismatch(actionGamePath, detectedVersion, actionGameName);
    }
  }

  return {
    isVersionNotificationsOpen,
    setIsVersionNotificationsOpen,
    visibleVersionMismatchGames,
    versionNotificationFeedItems,
    dismissVersionMismatch,
    resolveVersionMismatch,
    focusGameFromNotification,
    handleNotificationFeedAction,
  };
}
