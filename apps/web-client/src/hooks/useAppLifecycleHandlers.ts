/**
 * Encapsulates app bootstrap and persisted configuration actions.
 *
 * This hook initializes config/version state on mount and exposes setup-facing
 * handlers for root selection, config save, and view-mode persistence. It keeps
 * async status/error paths uniform, including menu-bar sync and refresh chaining
 * after successful writes.
 *
 * New to this project: this hook wires bootstrap and config save flows; start with initializeApp and saveConfig to see how persisted settings reach App state.
 */
import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { useGalleryClient } from '../client/context';
import type { GalleryConfig, GalleryViewMode, ScanRequestOptions } from '../types';
import { useAppLifecycleCore } from '../../../shared/app-shell/hooks/useAppLifecycleCore';

type RefreshScanMode = 'scan-only' | 'scan-and-sync' | 'parity-sync';

type UseAppLifecycleHandlersArgs = {
  config: GalleryConfig | null;
  isSaving: boolean;
  setConfig: Dispatch<SetStateAction<GalleryConfig | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setIsSaving: Dispatch<SetStateAction<boolean>>;
  setIsSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setViewMode: Dispatch<SetStateAction<GalleryViewMode>>;
  setAppVersion: Dispatch<SetStateAction<string>>;
  confirmInitialMirrorSync: () => Promise<boolean>;
  refreshScan: (mode?: RefreshScanMode, options?: ScanRequestOptions) => Promise<unknown>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
};

const CONFIG_SYNC_INTERVAL_MS = 3000;

function snapshotConfig(config: GalleryConfig) {
  return JSON.stringify(config);
}

function shouldRefreshScanOnConfigChange(previous: GalleryConfig, next: GalleryConfig) {
  if (previous.gamesRoot !== next.gamesRoot) {
    return true;
  }

  if (previous.metadataMirrorRoot !== next.metadataMirrorRoot) {
    return true;
  }

  if (previous.hideDotEntries !== next.hideDotEntries) {
    return true;
  }

  if (previous.versionFolderPattern !== next.versionFolderPattern) {
    return true;
  }

  if (previous.picturesFolderName !== next.picturesFolderName) {
    return true;
  }

  if (previous.excludePatterns.length !== next.excludePatterns.length) {
    return true;
  }

  for (let index = 0; index < previous.excludePatterns.length; index += 1) {
    if (previous.excludePatterns[index] !== next.excludePatterns[index]) {
      return true;
    }
  }

  return false;
}

export function useAppLifecycleHandlers({
  config,
  isSaving,
  setConfig,
  setStatus,
  setIsSaving,
  setIsSidebarOpen,
  setViewMode,
  setAppVersion,
  confirmInitialMirrorSync,
  refreshScan,
  logAppEvent,
  toErrorMessage,
}: UseAppLifecycleHandlersArgs) {
  const { t } = useTranslation();
  const galleryClient = useGalleryClient();
  const latestConfigRef = useRef<GalleryConfig | null>(null);
  const persistedConfigSnapshotRef = useRef<string | null>(null);
  const isSavingRef = useRef(false);

  useEffect(() => {
    latestConfigRef.current = config;
  }, [config]);

  useEffect(() => {
    isSavingRef.current = isSaving;
  }, [isSaving]);

  const lifecycleCore = useAppLifecycleCore<GalleryConfig, GalleryViewMode, ScanRequestOptions>({
    config,
    setConfig,
    setStatus,
    setIsSaving,
    setIsSidebarOpen,
    setViewMode,
    setAppVersion,
    confirmInitialMirrorSync,
    refreshScan,
    logAppEvent,
    toErrorMessage,
    t,
    galleryClient,
    defaultViewMode: 'poster',
    onConfigPersisted: (nextConfig) => {
      persistedConfigSnapshotRef.current = snapshotConfig(nextConfig);
    },
  });

  useEffect(() => {
    if (!config) {
      return;
    }

    let disposed = false;

    const syncRemoteConfig = async () => {
      if (disposed || isSavingRef.current) {
        return;
      }

      const currentConfig = latestConfigRef.current;
      if (!currentConfig) {
        return;
      }

      const persistedSnapshot = persistedConfigSnapshotRef.current;
      const localSnapshot = snapshotConfig(currentConfig);

      // Never clobber in-progress local edits that have not been persisted yet.
      if (persistedSnapshot && localSnapshot !== persistedSnapshot) {
        return;
      }

      try {
        const remoteConfig = await galleryClient.getConfig();
        if (disposed) {
          return;
        }

        const remoteSnapshot = snapshotConfig(remoteConfig);
        if (remoteSnapshot === localSnapshot) {
          persistedConfigSnapshotRef.current = remoteSnapshot;
          return;
        }

        const shouldRefreshScan = shouldRefreshScanOnConfigChange(currentConfig, remoteConfig);
        persistedConfigSnapshotRef.current = remoteSnapshot;
        setConfig(remoteConfig);
        setViewMode(remoteConfig.preferredViewMode ?? 'poster');
        setIsSidebarOpen(!remoteConfig.gamesRoot);
        await galleryClient.setMenuBarVisibility(remoteConfig.showSystemMenuBar);

        if (shouldRefreshScan && remoteConfig.gamesRoot) {
          await refreshScan();
        }
      } catch {
        // Sync is best-effort; keep last known local state when service polling fails.
      }
    };

    const intervalId = window.setInterval(() => {
      void syncRemoteConfig();
    }, CONFIG_SYNC_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [config, galleryClient, refreshScan, setConfig, setIsSidebarOpen, setViewMode]);


  return lifecycleCore;
}






