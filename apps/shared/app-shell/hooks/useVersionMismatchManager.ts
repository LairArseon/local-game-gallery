import { useEffect, useMemo, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { TFunction } from 'i18next';

type GalleryClientLike<TConfig, TMetadata> = {
  saveConfig: (config: TConfig) => Promise<unknown>;
  saveGameMetadata: (payload: {
    gamePath: string;
    title: string;
    metadata: TMetadata;
  }) => Promise<unknown>;
};

type VersionMismatchGameLike<TMetadata> = {
  path: string;
  name: string;
  hasVersionMismatch: boolean;
  isVersionMismatchDismissed: boolean;
  detectedLatestVersion: string;
  metadata: TMetadata;
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
};

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
      await galleryClient.saveGameMetadata({
        gamePath: targetGame.path,
        title: targetGame.name,
        metadata: {
          ...(targetGame.metadata as object),
          latestVersion: detectedVersion,
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

  return {
    isVersionNotificationsOpen,
    setIsVersionNotificationsOpen,
    visibleVersionMismatchGames,
    dismissVersionMismatch,
    resolveVersionMismatch,
    focusGameFromNotification,
  };
}
