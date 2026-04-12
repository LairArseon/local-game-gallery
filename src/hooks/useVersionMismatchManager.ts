/**
 * Encapsulates version-mismatch notification state and actions.
 *
 * Responsibilities:
 * - Derive visible mismatch entries from scan results.
 * - Persist dismiss/resolve actions through config and metadata writes.
 * - Coordinate notification-to-gallery focus transitions.
 *
 * Keeping this logic here prevents `App` from accumulating feature-specific
 * behavior while preserving a single orchestration surface for mismatch flows.
 *
 * New to this project: this hook owns mismatch notification lifecycle; start with visibleVersionMismatchGames and resolve/dismiss/focus action paths.
 */
import { useEffect, useMemo, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { TFunction } from 'i18next';
import type { GalleryConfig, ScanResult } from '../types';

type UseVersionMismatchManagerArgs = {
  config: GalleryConfig | null;
  setConfig: Dispatch<SetStateAction<GalleryConfig | null>>;
  scanResult: ScanResult;
  setStatus: Dispatch<SetStateAction<string>>;
  refreshScan: () => Promise<unknown>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
  t: TFunction;
  setDetailGamePath: Dispatch<SetStateAction<string | null>>;
  setSelectedGamePath: Dispatch<SetStateAction<string | null>>;
  cardsContainerRef: RefObject<HTMLDivElement | null>;
};

export function useVersionMismatchManager({
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
}: UseVersionMismatchManagerArgs) {
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

    // Optimistic update keeps the list responsive; rollback if persistence fails.
    const previousConfig = config;
    const nextConfig: GalleryConfig = {
      ...config,
      dismissedVersionMismatches: {
        ...(config.dismissedVersionMismatches ?? {}),
        [gamePath]: detectedVersion,
      },
    };

    setConfig(nextConfig);

    try {
      await window.gallery.saveConfig(nextConfig);
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
      await window.gallery.saveGameMetadata({
        gamePath: targetGame.path,
        title: targetGame.name,
        metadata: {
          ...targetGame.metadata,
          latestVersion: detectedVersion,
        },
      });

      if (config?.dismissedVersionMismatches?.[gamePath]) {
        // A resolved mismatch should no longer keep a stale dismissed marker.
        const nextDismissed = { ...config.dismissedVersionMismatches };
        delete nextDismissed[gamePath];
        const nextConfig: GalleryConfig = {
          ...config,
          dismissedVersionMismatches: nextDismissed,
        };
        setConfig(nextConfig);
        await window.gallery.saveConfig(nextConfig);
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
    // Wait one tick so selection state is reflected in DOM before querying cards.
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





