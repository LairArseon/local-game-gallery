import { useEffect, type Dispatch, type SetStateAction, type SubmitEventHandler } from 'react';

export type RefreshScanMode = 'scan-only' | 'scan-and-sync' | 'parity-sync';

type GalleryClientLike<TConfig, TViewMode> = {
  getConfig: () => Promise<TConfig>;
  getAppVersion: () => Promise<string>;
  setMenuBarVisibility: (visible: boolean) => Promise<void>;
  pickGamesRoot: () => Promise<string | null>;
  pickMetadataMirrorRoot: () => Promise<string | null>;
  saveConfig: (config: TConfig) => Promise<TConfig>;
};

type UseAppLifecycleCoreArgs<TConfig extends {
  gamesRoot: string;
  metadataMirrorRoot: string;
  showSystemMenuBar: boolean;
  preferredViewMode?: TViewMode;
  excludePatterns: string[];
}, TViewMode extends string, TScanOptions> = {
  config: TConfig | null;
  setConfig: Dispatch<SetStateAction<TConfig | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setIsSaving: Dispatch<SetStateAction<boolean>>;
  setIsSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setViewMode: Dispatch<SetStateAction<TViewMode>>;
  setAppVersion: Dispatch<SetStateAction<string>>;
  confirmInitialMirrorSync: () => Promise<boolean>;
  refreshScan: (mode?: RefreshScanMode, options?: TScanOptions) => Promise<unknown>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
  t: (key: string, options?: Record<string, unknown>) => string;
  galleryClient: GalleryClientLike<TConfig, TViewMode>;
  defaultViewMode: TViewMode;
  onConfigPersisted?: (config: TConfig) => void;
};

function shouldPromptInitialMirrorSync<TConfig extends { metadataMirrorRoot: string }>(
  previousConfig: TConfig,
  nextConfig: TConfig,
) {
  const previousMirrorRoot = String(previousConfig.metadataMirrorRoot ?? '').trim();
  const nextMirrorRoot = String(nextConfig.metadataMirrorRoot ?? '').trim();
  return Boolean(nextMirrorRoot) && previousMirrorRoot !== nextMirrorRoot;
}

export function useAppLifecycleCore<
  TConfig extends {
    gamesRoot: string;
    metadataMirrorRoot: string;
    showSystemMenuBar: boolean;
    preferredViewMode?: TViewMode;
    excludePatterns: string[];
  },
  TViewMode extends string,
  TScanOptions,
>({
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
  defaultViewMode,
  onConfigPersisted,
}: UseAppLifecycleCoreArgs<TConfig, TViewMode, TScanOptions>) {
  useEffect(() => {
    const initialize = async () => {
      try {
        const [loadedConfig, loadedVersion] = await Promise.all([
          galleryClient.getConfig(),
          galleryClient.getAppVersion(),
        ]);

        onConfigPersisted?.(loadedConfig);
        setConfig(loadedConfig);
        setAppVersion(loadedVersion);
        await galleryClient.setMenuBarVisibility(loadedConfig.showSystemMenuBar);
        setViewMode(loadedConfig.preferredViewMode ?? defaultViewMode);
        setIsSidebarOpen(!loadedConfig.gamesRoot);
        setStatus(loadedConfig.gamesRoot ? t('status.readyToScan') : t('status.pickRootFirst'));

        if (loadedConfig.gamesRoot) {
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
      if (!selectedPath || !config) {
        return;
      }

      setIsSaving(true);
      const savedConfig = await galleryClient.saveConfig({
        ...config,
        gamesRoot: selectedPath,
      });
      onConfigPersisted?.(savedConfig);
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
      onConfigPersisted?.(savedConfig);
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
        excludePatterns: config.excludePatterns.filter(Boolean),
      });
      onConfigPersisted?.(savedConfig);
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

  async function changeViewMode(mode: TViewMode) {
    setViewMode(mode);

    if (!config) {
      return;
    }

    try {
      const savedConfig = await galleryClient.saveConfig({
        ...config,
        preferredViewMode: mode,
      });
      onConfigPersisted?.(savedConfig);
      setConfig(savedConfig);
    } catch {
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
