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
import { useEffect, useRef, type Dispatch, type SetStateAction, type SubmitEventHandler } from 'react';
import { useTranslation } from 'react-i18next';
import { useGalleryClient } from '../client/context';
import type { GalleryConfig, GalleryViewMode, ScanRequestOptions } from '../types';

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

function shouldPromptInitialMirrorSync(previousConfig: GalleryConfig, nextConfig: GalleryConfig) {
  const previousMirrorRoot = String(previousConfig.metadataMirrorRoot ?? '').trim();
  const nextMirrorRoot = String(nextConfig.metadataMirrorRoot ?? '').trim();
  return Boolean(nextMirrorRoot) && previousMirrorRoot !== nextMirrorRoot;
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

  useEffect(() => {
    const initialize = async () => {
      try {
        // Load both values together so first paint uses a single consistent config snapshot.
        const [loadedConfig, loadedVersion] = await Promise.all([
          galleryClient.getConfig(),
          galleryClient.getAppVersion(),
        ]);
        persistedConfigSnapshotRef.current = snapshotConfig(loadedConfig);
        setConfig(loadedConfig);
        setAppVersion(loadedVersion);
        await galleryClient.setMenuBarVisibility(loadedConfig.showSystemMenuBar);
        setViewMode(loadedConfig.preferredViewMode ?? 'poster');
        // Keep setup panel visible until a root is configured.
        setIsSidebarOpen(!loadedConfig.gamesRoot);
        setStatus(loadedConfig.gamesRoot ? t('status.readyToScan') : t('status.pickRootFirst'));

        if (loadedConfig.gamesRoot) {
          // Startup performs discovery scan only; mirror sync waits for manual refresh.
          await refreshScan('scan-only');
        }
      } catch (error) {
        const logMessage = toErrorMessage(error, 'Failed to load configuration.');
        setStatus(t('status.failedLoadConfig'));
        void logAppEvent(logMessage, 'error', 'initialize');
      }
    };

    void initialize();
  }, []);

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

  async function pickRoot() {
    try {
      const selectedPath = await galleryClient.pickGamesRoot();
      // The picker can be canceled, and config may not be ready during early mount.
      if (!selectedPath || !config) {
        return;
      }

      setIsSaving(true);
      const savedConfig = await galleryClient.saveConfig({
        ...config,
        gamesRoot: selectedPath,
      });
      persistedConfigSnapshotRef.current = snapshotConfig(savedConfig);
      setConfig(savedConfig);
      setStatus(t('status.libraryFolderSaved'));
      await refreshScan();
    } catch (error) {
      const logMessage = toErrorMessage(error, 'Failed to open folder picker.');
      setStatus(t('status.failedOpenFolderPicker'));
      void logAppEvent(logMessage, 'error', 'pick-root');
    } finally {
      setIsSaving(false);
    }
  }

  async function pickMetadataMirrorRoot() {
    try {
      const selectedPath = await galleryClient.pickMetadataMirrorRoot();
      if (!selectedPath || !config) {
        return;
      }

      setIsSaving(true);
      const previousConfig = config;
      const savedConfig = await galleryClient.saveConfig({
        ...config,
        metadataMirrorRoot: selectedPath,
      });
      persistedConfigSnapshotRef.current = snapshotConfig(savedConfig);
      setConfig(savedConfig);
      setStatus(t('status.metadataMirrorFolderSaved'));

      const shouldPromptSync = shouldPromptInitialMirrorSync(previousConfig, savedConfig);
      if (!shouldPromptSync) {
        return;
      }

      const shouldSyncNow = await confirmInitialMirrorSync();
      if (shouldSyncNow) {
        await refreshScan();
      }
    } catch (error) {
      const logMessage = toErrorMessage(error, 'Failed to open metadata mirror folder picker.');
      setStatus(t('status.failedOpenMirrorFolderPicker'));
      void logAppEvent(logMessage, 'error', 'pick-metadata-mirror-root');
    } finally {
      setIsSaving(false);
    }
  }

  const saveConfig: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (!config) {
      return;
    }

    setIsSaving(true);
    try {
      const savedConfig = await galleryClient.saveConfig({
        ...config,
        // Persist only non-empty patterns to prevent accidental catch-all blanks.
        excludePatterns: config.excludePatterns.filter(Boolean),
      });
      persistedConfigSnapshotRef.current = snapshotConfig(savedConfig);
      setConfig(savedConfig);
      await galleryClient.setMenuBarVisibility(savedConfig.showSystemMenuBar);
      setStatus(t('status.configurationSaved'));
      setIsSidebarOpen(false);
      await refreshScan();
    } catch (error) {
      const logMessage = toErrorMessage(error, 'Failed to save configuration.');
      setStatus(t('status.failedSaveConfig'));
      void logAppEvent(logMessage, 'error', 'save-config');
    } finally {
      setIsSaving(false);
    }
  };

  async function changeViewMode(mode: GalleryViewMode) {
    // Apply immediately for responsive UX, then persist in background.
    setViewMode(mode);

    if (!config) {
      return;
    }

    try {
      const savedConfig = await galleryClient.saveConfig({
        ...config,
        preferredViewMode: mode,
      });
      persistedConfigSnapshotRef.current = snapshotConfig(savedConfig);
      setConfig(savedConfig);
    } catch {
      // Keep the selected view active even if persistence fails; warn and continue.
      setStatus(t('status.failedPersistViewMode'));
      void logAppEvent('Failed to persist selected view mode.', 'warn', 'change-view-mode');
    }
  }

  return {
    pickRoot,
    pickMetadataMirrorRoot,
    saveConfig,
    changeViewMode,
  };
}






