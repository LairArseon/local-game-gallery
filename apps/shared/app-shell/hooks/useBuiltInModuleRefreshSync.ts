import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { GalleryApi, GalleryConfig, NotificationFeedItem, GameSummary } from '../types';
import type { ResolvedBuiltInModule } from '../core/moduleRegistry';

type UseBuiltInModuleRefreshSyncArgs = {
  scanMarker: string;
  games: GameSummary[];
  modules: ResolvedBuiltInModule[];
  config: GalleryConfig | null;
  setConfig: Dispatch<SetStateAction<GalleryConfig | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
  galleryClient: GalleryApi;
  refreshGame?: (gamePath: string) => Promise<unknown>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
};

function readDismissedNotificationMarkers(config: GalleryConfig | null, moduleId: string) {
  const rawValue = config?.modules?.[moduleId]?.state?.dismissedNotificationMarkers;
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    return {} as Record<string, string>;
  }

  return Object.entries(rawValue).reduce<Record<string, string>>((current, [key, value]) => {
    if (typeof value !== 'string' || !key.trim()) {
      return current;
    }

    current[key] = value;
    return current;
  }, {});
}

function getNotificationDismissalKey(item: NotificationFeedItem) {
  return String(item.gamePath ?? item.sourceId ?? item.id).trim();
}

function getNotificationDismissalMarker(item: NotificationFeedItem) {
  return String(item.metadata?.notificationMarker ?? item.id).trim();
}

function collectPersistentModuleNotificationItems(
  config: GalleryConfig | null,
  modules: ResolvedBuiltInModule[],
  games: GameSummary[],
) {
  if (!config) {
    return [] as NotificationFeedItem[];
  }

  return modules
    .filter((moduleEntry) => moduleEntry.configState.installed && moduleEntry.configState.enabled)
    .flatMap((moduleEntry) => {
      const dismissedNotificationMarkers = readDismissedNotificationMarkers(config, moduleEntry.definition.id);
      return moduleEntry.definition.contributes
        .filter((contribution) => contribution.slot === 'notification.feed' && contribution.getItems)
        .flatMap((contribution) => contribution.getItems?.({
          moduleId: moduleEntry.definition.id,
          moduleDisplayName: moduleEntry.definition.displayName,
          config,
          configState: moduleEntry.configState,
          games,
        }) ?? [])
        .filter((item) => dismissedNotificationMarkers[getNotificationDismissalKey(item)] !== getNotificationDismissalMarker(item));
    });
}

function mergeNotificationItems(currentItems: NotificationFeedItem[], nextItems: NotificationFeedItem[]) {
  const merged = [...currentItems];
  const seenIds = new Set(currentItems.map((item) => item.id));
  for (const item of nextItems) {
    if (seenIds.has(item.id)) {
      continue;
    }

    seenIds.add(item.id);
    merged.push(item);
  }

  merged.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  return merged;
}

export function useBuiltInModuleRefreshSync({
  scanMarker,
  games,
  modules,
  config,
  setConfig,
  setStatus,
  galleryClient,
  refreshGame,
  logAppEvent,
  toErrorMessage,
}: UseBuiltInModuleRefreshSyncArgs) {
  const lastProcessedScanMarkerRef = useRef('');
  const latestConfigRef = useRef<GalleryConfig | null>(config);
  const [transientModuleNotificationFeedItems, setTransientModuleNotificationFeedItems] = useState<NotificationFeedItem[]>([]);

  latestConfigRef.current = config;

  const persistentModuleNotificationFeedItems = useMemo(
    () => collectPersistentModuleNotificationItems(config, modules, games),
    [config, games, modules],
  );

  const moduleNotificationFeedItems = useMemo(
    () => mergeNotificationItems(persistentModuleNotificationFeedItems, transientModuleNotificationFeedItems),
    [persistentModuleNotificationFeedItems, transientModuleNotificationFeedItems],
  );

  useEffect(() => {
    if (!scanMarker || !config || lastProcessedScanMarkerRef.current === scanMarker) {
      return;
    }

    lastProcessedScanMarkerRef.current = scanMarker;
    const enabledModules = modules.filter(
      (moduleEntry) => moduleEntry.configState.installed && moduleEntry.configState.enabled && moduleEntry.definition.refresh,
    );
    if (!enabledModules.length) {
      return;
    }

    let isDisposed = false;

    void (async () => {
      let workingConfig = config;
      const updatedGamePaths = new Set<string>();
      const nextNotifications: NotificationFeedItem[] = [];

      for (const moduleEntry of enabledModules) {
        try {
          const result = await moduleEntry.definition.refresh?.({
            moduleId: moduleEntry.definition.id,
            moduleDisplayName: moduleEntry.definition.displayName,
            config: workingConfig,
            configState: moduleEntry.configState,
            games,
            galleryClient,
            logAppEvent,
            toErrorMessage,
          });

          if (!result) {
            continue;
          }

          if (result.nextConfigState) {
            const latestModuleState = latestConfigRef.current?.modules?.[moduleEntry.definition.id];
            const currentModuleState = workingConfig.modules?.[moduleEntry.definition.id];
            workingConfig = {
              ...workingConfig,
              modules: {
                ...workingConfig.modules,
                [moduleEntry.definition.id]: {
                  installed: result.nextConfigState.installed,
                  enabled: result.nextConfigState.enabled,
                  state: {
                    ...(latestModuleState?.state ?? currentModuleState?.state ?? {}),
                    ...result.nextConfigState.state,
                  },
                },
              },
            };
          }

          for (const gamePath of result.updatedGamePaths ?? []) {
            updatedGamePaths.add(gamePath);
          }

          nextNotifications.push(...(result.notifications ?? []));
        } catch (error) {
          const logMessage = toErrorMessage(error, `Module refresh failed for ${moduleEntry.definition.displayName}.`);
          void logAppEvent(logMessage, 'error', 'module-refresh');
        }
      }

      if (isDisposed) {
        return;
      }

      if (workingConfig !== config) {
        try {
          const savedConfig = await galleryClient.saveConfig(workingConfig);
          if (!isDisposed) {
            setConfig(savedConfig);
          }
        } catch (error) {
          const logMessage = toErrorMessage(error, 'Failed to persist module refresh state.');
          void logAppEvent(logMessage, 'error', 'module-refresh-save-config');
        }
      }

      if (nextNotifications.length && !isDisposed) {
        setTransientModuleNotificationFeedItems((current) => mergeNotificationItems(current, nextNotifications));
      }

      if (updatedGamePaths.size && refreshGame) {
        await Promise.all([...updatedGamePaths].map((gamePath) => refreshGame(gamePath)));
      }
    })();

    return () => {
      isDisposed = true;
    };
  }, [config, galleryClient, games, logAppEvent, modules, refreshGame, scanMarker, setConfig, toErrorMessage]);

  return {
    moduleNotificationFeedItems,
    dismissModuleNotification: (item: NotificationFeedItem) => {
      setTransientModuleNotificationFeedItems((current) => current.filter((currentItem) => currentItem.id !== item.id));

      const moduleId = String(item.metadata?.moduleId ?? item.sourceId ?? '').trim();
      if (!config || !moduleId || item.sourceKind !== 'module') {
        return;
      }

      const previousConfig = config;
      const dismissedNotificationMarkers = readDismissedNotificationMarkers(config, moduleId);
      const dismissalKey = getNotificationDismissalKey(item);
      const dismissalMarker = getNotificationDismissalMarker(item);
      const nextConfig: GalleryConfig = {
        ...config,
        modules: {
          ...config.modules,
          [moduleId]: {
            ...(config.modules?.[moduleId] ?? { installed: true, enabled: true, state: {} }),
            state: {
              ...(config.modules?.[moduleId]?.state ?? {}),
              dismissedNotificationMarkers: {
                ...dismissedNotificationMarkers,
                [dismissalKey]: dismissalMarker,
              },
            },
          },
        },
      };

      setConfig(nextConfig);
      void galleryClient.saveConfig(nextConfig).then(() => {
        setStatus(`Dismissed ${moduleId.toUpperCase()} notification.`);
      }).catch((error) => {
        const message = toErrorMessage(error, 'Failed to dismiss module notification.');
        setStatus(message);
        void logAppEvent(message, 'error', 'dismiss-module-notification');
        setConfig(previousConfig);
      });
    },
  };
}