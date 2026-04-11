/**
 * Encapsulates app bootstrap and persisted configuration actions.
 *
 * This hook initializes config/version state on mount and exposes setup-facing
 * handlers for root selection, config save, and view-mode persistence. It keeps
 * async status/error paths uniform, including menu-bar sync and refresh chaining
 * after successful writes.
 */
import { useEffect, type Dispatch, type SetStateAction, type SubmitEventHandler } from 'react';
import { useTranslation } from 'react-i18next';
import type { GalleryConfig, GalleryViewMode } from '../types';

type UseAppLifecycleHandlersArgs = {
  config: GalleryConfig | null;
  setConfig: Dispatch<SetStateAction<GalleryConfig | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setIsSaving: Dispatch<SetStateAction<boolean>>;
  setIsSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setViewMode: Dispatch<SetStateAction<GalleryViewMode>>;
  setAppVersion: Dispatch<SetStateAction<string>>;
  refreshScan: () => Promise<unknown>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
};

export function useAppLifecycleHandlers({
  config,
  setConfig,
  setStatus,
  setIsSaving,
  setIsSidebarOpen,
  setViewMode,
  setAppVersion,
  refreshScan,
  logAppEvent,
  toErrorMessage,
}: UseAppLifecycleHandlersArgs) {
  const { t } = useTranslation();

  useEffect(() => {
    const initialize = async () => {
      try {
        // Load both values together so first paint uses a single consistent config snapshot.
        const [loadedConfig, loadedVersion] = await Promise.all([
          window.gallery.getConfig(),
          window.gallery.getAppVersion(),
        ]);
        setConfig(loadedConfig);
        setAppVersion(loadedVersion);
        await window.gallery.setMenuBarVisibility(loadedConfig.showSystemMenuBar);
        setViewMode(loadedConfig.preferredViewMode ?? 'poster');
        // Keep setup panel visible until a root is configured.
        setIsSidebarOpen(!loadedConfig.gamesRoot);
        setStatus(loadedConfig.gamesRoot ? t('status.readyToScan') : t('status.pickRootFirst'));

        // Avoid unnecessary scan work when setup is still incomplete.
        if (loadedConfig.gamesRoot) {
          await refreshScan();
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
      const selectedPath = await window.gallery.pickGamesRoot();
      // The picker can be canceled, and config may not be ready during early mount.
      if (!selectedPath || !config) {
        return;
      }

      setIsSaving(true);
      const savedConfig = await window.gallery.saveConfig({
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

  const saveConfig: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (!config) {
      return;
    }

    setIsSaving(true);
    try {
      const savedConfig = await window.gallery.saveConfig({
        ...config,
        // Persist only non-empty patterns to prevent accidental catch-all blanks.
        excludePatterns: config.excludePatterns.filter(Boolean),
      });
      setConfig(savedConfig);
      await window.gallery.setMenuBarVisibility(savedConfig.showSystemMenuBar);
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
      const savedConfig = await window.gallery.saveConfig({
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
    saveConfig,
    changeViewMode,
  };
}
