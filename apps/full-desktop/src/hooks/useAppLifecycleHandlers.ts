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
import { useEffect, type Dispatch, type SetStateAction, type SubmitEventHandler } from 'react';
import { useTranslation } from 'react-i18next';
import { useGalleryClient } from '../client/context';
import type { GalleryConfig, GalleryViewMode, ScanRequestOptions } from '../types';

type RefreshScanMode = 'scan-only' | 'scan-and-sync' | 'parity-sync';

type UseAppLifecycleHandlersArgs = {
  config: GalleryConfig | null;
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

function shouldPromptInitialMirrorSync(previousConfig: GalleryConfig, nextConfig: GalleryConfig) {
  const previousMirrorRoot = String(previousConfig.metadataMirrorRoot ?? '').trim();
  const nextMirrorRoot = String(nextConfig.metadataMirrorRoot ?? '').trim();
  return Boolean(nextMirrorRoot) && previousMirrorRoot !== nextMirrorRoot;
}

export function useAppLifecycleHandlers({
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
}: UseAppLifecycleHandlersArgs) {
  const { t } = useTranslation();
  const galleryClient = useGalleryClient();

  useEffect(() => {
    const initialize = async () => {
      try {
        // Load both values together so first paint uses a single consistent config snapshot.
        const [loadedConfig, loadedVersion] = await Promise.all([
          galleryClient.getConfig(),
          galleryClient.getAppVersion(),
        ]);
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






