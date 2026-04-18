/**
 * App shell and state orchestration for Local Game Gallery.
 *
 * Entry-point flow (high level):
 * 1) Initialize persisted config/version and run startup scan-only refresh.
 * 2) Compose domain hooks (filters, metadata, media, tag pool, shortcuts).
 * 3) Derive view-model state (selected/detail games, scaling, grid columns).
 * 4) Render orchestration-only layout shells (topbar/setup/library/modals).
 *
 * Trigger model:
 * - UI actions (buttons, keyboard, context menu) call stable handlers from hooks.
 * - Handlers perform IPC/persistence work, then update local state/status.
 * - App recomputes memoized derived values and delegates rendering to components.
 *
 * This file intentionally focuses on wiring and lifecycle order, while detailed
 * business behavior lives in domain hooks/components.
 *
 * New to this project: read App top-to-bottom to see feature composition order, then jump into each imported hook for domain behavior and IPC/persistence details.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { FilterOrderByMode, GalleryConfig, GalleryViewMode, ScanResult, ServiceCapabilities } from './types';
import { LibraryPanel } from './components/LibraryPanel';
import { ModalHost } from './components/ModalHost';
import { SetupPanel } from './components/SetupPanel';
import { TopbarControls } from './components/TopbarControls';
import { TopbarPanels } from './components/TopbarPanels';
import { VersionMismatchPanel } from './components/VersionMismatchPanel';
import { useAppIconSettings } from './hooks/useAppIconSettings';
import { useLogViewer } from './hooks/useLogViewer';
import { useMediaManager } from './hooks/useMediaManager';
import { useMetadataManager } from './hooks/useMetadataManager';
import { useFilterManager } from './hooks/useFilterManager';
import { useTagPoolManager } from './hooks/useTagPoolManager';
import { useTagAutocompleteManager } from './hooks/useTagAutocompleteManager';
import { useTopbarPanelHandlers } from './hooks/useTopbarPanelHandlers';
import { useAppViewHandlers } from './hooks/useAppViewHandlers';
import { useGalleryRenderers } from './hooks/useGalleryRenderers';
import { useStartupTagPoolSync } from './hooks/useStartupTagPoolSync';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { useContextMenuListeners } from './hooks/useContextMenuListeners';
import { useVersionStorage } from './hooks/useVersionStorage';
import { useResponsiveGrid } from './hooks/useResponsiveGrid';
import { useAppLifecycleHandlers } from './hooks/useAppLifecycleHandlers';
import { useGameActions } from './hooks/useGameActions';
import { useVersionMismatchManager } from './hooks/useVersionMismatchManager';
import { useVaultManager } from './hooks/useVaultManager';
import { clamp } from './utils/app-helpers';
import { useGalleryClient } from './client/context';

const emptyScan: ScanResult = {
  rootPath: '',
  scannedAt: '',
  games: [],
  warnings: [],
  usingMirrorFallback: false,
};

const dynamicScaleBaselineColumns: Record<'poster' | 'card', number> = {
  poster: 5,
  card: 4,
};

const narrowViewportMaxWidthPx = 760;
const fallbackRecoveryProbeIntervalMs = 12000;
type RefreshScanMode = 'scan-only' | 'scan-and-sync' | 'parity-sync' | 'fallback-recovery-probe';

const desktopCapabilities: ServiceCapabilities = {
  supportsLaunch: true,
  supportsHostFolderPicker: true,
  launchPolicy: 'host-desktop-only',
  supportsNativeContextMenu: true,
  supportsTrayLifecycle: true,
  clientMode: 'desktop',
  isContainerized: false,
  isGamesRootEditable: true,
};

const webCapabilities: ServiceCapabilities = {
  supportsLaunch: false,
  supportsHostFolderPicker: false,
  launchPolicy: 'host-desktop-only',
  supportsNativeContextMenu: false,
  supportsTrayLifecycle: false,
  clientMode: 'web',
  isContainerized: false,
  isGamesRootEditable: true,
};

function App() {
  const { t, i18n } = useTranslation();
  const galleryClient = useGalleryClient();
  const hasDesktopBridge = typeof window !== 'undefined' && 'gallery' in window;

  // Core app/session state, mostly persisted config + current scan/session UI state.
  const [config, setConfig] = useState<GalleryConfig | null>(null);
  const [appVersion, setAppVersion] = useState('');
  const [scanResult, setScanResult] = useState<ScanResult>(emptyScan);
  const [status, setStatus] = useState(() => t('app.loadingConfig'));
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<GalleryViewMode>('poster');
  const [selectedGamePath, setSelectedGamePath] = useState<string | null>(null);
  const [detailGamePath, setDetailGamePath] = useState<string | null>(null);
  const [isNarrowViewport, setIsNarrowViewport] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= narrowViewportMaxWidthPx : false
  ));
  const [gridColumns, setGridColumns] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [isTagPoolPanelOpen, setIsTagPoolPanelOpen] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [isMirrorSyncConfirmOpen, setIsMirrorSyncConfirmOpen] = useState(false);
  const [isMirrorParityConfirmOpen, setIsMirrorParityConfirmOpen] = useState(false);
  const [decompressLaunchConfirmContext, setDecompressLaunchConfirmContext] = useState<{ gameName: string; versionName: string } | null>(null);
  const [screenshotModalPath, setScreenshotModalPath] = useState<string | null>(null);
  const [focusCarouselIndexByGamePath, setFocusCarouselIndexByGamePath] = useState<Record<string, number>>({});
  const [serviceCapabilities, setServiceCapabilities] = useState<ServiceCapabilities>(() => (
    hasDesktopBridge ? desktopCapabilities : webCapabilities
  ));
  const [activeTagAutocomplete, setActiveTagAutocomplete] = useState<{
    scope: 'pool' | 'filter' | 'metadata';
    index: number;
    highlighted: number;
  } | null>(null);
  const cardsContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const mirrorSyncConfirmResolveRef = useRef<((shouldSync: boolean) => void) | null>(null);
  const mirrorParityConfirmResolveRef = useRef<((shouldSync: boolean) => void) | null>(null);
  const decompressLaunchConfirmResolveRef = useRef<((shouldDecompress: boolean) => void) | null>(null);
  const scanInFlightRef = useRef<Promise<ScanResult | null> | null>(null);
  const refreshScanRef = useRef<((mode?: RefreshScanMode) => Promise<ScanResult | null>) | null>(null);

  useEffect(() => {
    if (!config?.language) {
      return;
    }

    if (i18n.language.toLowerCase().startsWith(config.language)) {
      return;
    }

    void i18n.changeLanguage(config.language);
  }, [config?.language, i18n]);

  useEffect(() => {
    const updateViewportMode = () => {
      setIsNarrowViewport(window.innerWidth <= narrowViewportMaxWidthPx);
    };

    updateViewportMode();
    window.addEventListener('resize', updateViewportMode);

    return () => {
      window.removeEventListener('resize', updateViewportMode);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadServiceCapabilities = async () => {
      try {
        const capabilities = await galleryClient.getServiceCapabilities();
        if (isMounted) {
          setServiceCapabilities(capabilities);
        }
      } catch {
        // Keep fallback capability profile when service metadata cannot be loaded.
      }
    };

    void loadServiceCapabilities();

    return () => {
      isMounted = false;
    };
  }, [galleryClient]);

  useEffect(() => {
    if (!isNarrowViewport || !detailGamePath) {
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [detailGamePath, isNarrowViewport]);

  useEffect(() => () => {
    if (!mirrorSyncConfirmResolveRef.current) {
      if (!mirrorParityConfirmResolveRef.current) {
        if (!decompressLaunchConfirmResolveRef.current) {
          return;
        }
      }
    }

    if (mirrorSyncConfirmResolveRef.current) {
      mirrorSyncConfirmResolveRef.current(false);
      mirrorSyncConfirmResolveRef.current = null;
    }

    if (mirrorParityConfirmResolveRef.current) {
      mirrorParityConfirmResolveRef.current(false);
      mirrorParityConfirmResolveRef.current = null;
    }

    if (decompressLaunchConfirmResolveRef.current) {
      decompressLaunchConfirmResolveRef.current(false);
      decompressLaunchConfirmResolveRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isScanning) {
      return;
    }

    const progressInterval = window.setInterval(() => {
      setScanProgress((current) => {
        if (current >= 0.94) {
          return current;
        }

        const easedNext = current + ((1 - current) * 0.08);
        return Math.min(easedNext, 0.94);
      });
    }, 180);

    return () => {
      window.clearInterval(progressInterval);
    };
  }, [isScanning]);

  useEffect(() => {
    if (isScanning || scanProgress <= 0) {
      return;
    }

    if (scanProgress < 1) {
      setScanProgress(1);
    }

    const resetDelay = window.setTimeout(() => {
      setScanProgress(0);
    }, 260);

    return () => {
      window.clearTimeout(resetDelay);
    };
  }, [isScanning, scanProgress]);

  const isUsingMirrorFallback = scanResult.usingMirrorFallback;
  const launchBlockedMessage = isUsingMirrorFallback ? t('status.launchDisabledMirrorFallback') : null;
  const canLaunch = serviceCapabilities.supportsLaunch && !isUsingMirrorFallback;
  const canOpenFolders = serviceCapabilities.clientMode === 'desktop';
  const supportsNativeContextMenu = serviceCapabilities.supportsNativeContextMenu;
  const isGamesRootEditable = serviceCapabilities.isGamesRootEditable !== false;
  const supportsFolderPicker = hasDesktopBridge || serviceCapabilities.supportsHostFolderPicker;

  const actionLabels = useMemo(() => ({
    play: t('actions.play'),
    playByVersion: t('actions.playByVersion'),
    open: t('actions.open'),
    back: t('actions.back'),
    rescan: t('actions.rescan'),
    scanning: t('actions.scanning'),
    showTagPool: t('actions.showTagPool'),
    hideTagPool: t('actions.hideTagPool'),
    showFilters: t('actions.showFilters'),
    hideFilters: t('actions.hideFilters'),
    showSetup: t('actions.showSetup'),
    hideSetup: t('actions.hideSetup'),
    showVault: t('actions.showVault'),
    hideVault: t('actions.hideVault'),
    showVersionNotifications: t('actions.showVersionNotifications'),
    hideVersionNotifications: t('actions.hideVersionNotifications'),
    chooseLibraryFolder: t('actions.chooseLibraryFolder'),
    saving: t('actions.saving'),
  } as const), [t]);

  const viewModeLabels = useMemo<Record<GalleryViewMode, string>>(() => ({
    poster: t('viewMode.poster'),
    card: t('viewMode.card'),
    compact: t('viewMode.compact'),
    expanded: t('viewMode.expanded'),
  }), [t]);

  const orderByModeLabels = useMemo<Record<FilterOrderByMode, string>>(() => ({
    'alpha-asc': t('orderBy.alpha-asc'),
    'alpha-desc': t('orderBy.alpha-desc'),
    'score-asc': t('orderBy.score-asc'),
    'score-desc': t('orderBy.score-desc'),
  }), [t]);

  // Domain manager: app icon selection, validation, drag/drop staging, preview/apply.
  const {
    appIconSummary,
    appIconPreviewSrc,
    isAppIconDragActive,
    pickAppIconPng,
    handleDropAppIconFile,
    handleAppIconDragEnter,
    handleAppIconDragLeave,
    resetAppIcon,
    applyAppIconNow,
  } = useAppIconSettings({
    config,
    setConfig,
    setStatus,
    logAppEvent,
    toErrorMessage,
  });

  // Domain manager: diagnostics viewer lifecycle and log filtering/clearing actions.
  const {
    isLogModalOpen,
    isLogLoading,
    isLogClearing,
    logLevelFilter,
    logDateFilter,
    filteredLogContents,
    setLogLevelFilter,
    setLogDateFilter,
    openLogViewer,
    closeLogViewer,
    clearLogsFromViewer,
    openLogFolderFromSetup,
  } = useLogViewer({
    setStatus,
    logAppEvent,
    toErrorMessage,
  });

  // Domain manager: media modal state + image import/reorder/remove orchestration.
  const {
    mediaModalGamePath,
    isMediaSaving,
    featuredImportTarget,
    pendingFeaturedDropPaths,
    dragSection,
    draggedScreenshotPath,
    dragOverScreenshotPath,
    screenshotContextMenu,
    setFeaturedImportTarget,
    setPendingFeaturedDropPaths,
    setDragSection,
    setDraggedScreenshotPath,
    setDragOverScreenshotPath,
    setScreenshotContextMenu,
    openPicturesModal,
    closePicturesModal,
    importMedia,
    reorderScreenshots,
    removeScreenshot,
    filePathToSrc,
  } = useMediaManager({
    setStatus,
    logAppEvent,
    toErrorMessage,
    refreshScan,
  });

  // Domain manager: staged filters/presets and final applied game list projection.
  const {
    draftTagRules,
    activeFilterRuleEditorIndex,
    draftMinScore,
    draftStatus,
    draftOrderBy,
    isPresetNamingOpen,
    draftPresetName,
    isPresetSaving,
    filteredGames,
    setDraftTagRules,
    setActiveFilterRuleEditorIndex,
    setDraftMinScore,
    setDraftStatus,
    setDraftOrderBy,
    setIsPresetNamingOpen,
    setDraftPresetName,
    resetStagedFilters,
    beginSavePreset,
    saveCurrentFilterPreset,
    loadFilterPresetToDraft,
    renameFilterPreset,
    deleteFilterPreset,
  } = useFilterManager({
    config,
    setConfig,
    games: scanResult.games,
    searchQuery,
    setStatus,
    logAppEvent,
    toErrorMessage,
    setActiveTagAutocomplete,
  });

  // Domain manager: metadata edit modal lifecycle and metadata persistence.
  const {
    metadataModalGamePath,
    metadataDraft,
    isMetadataSaving,
    activeMetadataTagEditorIndex,
    setMetadataDraft,
    setActiveMetadataTagEditorIndex,
    openMetadataModal,
    closeMetadataModal,
    saveMetadataChanges,
  } = useMetadataManager({
    config,
    setConfig,
    games: scanResult.games,
    setStatus,
    refreshScan,
    logAppEvent,
    toErrorMessage,
    setActiveTagAutocomplete,
  });

  // Domain manager: tag-pool edit lifecycle + persistence and usage-aware rules.
  const {
    activeTagPoolEditorIndex,
    persistTagPool,
    removeTagFromPoolByIndex,
    finalizeTagPoolEdit,
    startTagPoolEdit,
    updateTagPoolEditorValue,
    addTagToPool,
    setActiveTagPoolEditorIndex,
  } = useTagPoolManager({
    config,
    setConfig,
    games: scanResult.games,
    refreshScan,
    setStatus,
    logAppEvent,
    toErrorMessage,
    setActiveTagAutocomplete,
  });

  function toErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
  }

  async function logAppEvent(message: string, level: 'info' | 'warn' | 'error' = 'info', source = 'renderer') {
    try {
      await galleryClient.logEvent({ message, level, source });
    } catch {
      // Avoid status recursion if logging backend is unavailable.
    }
  }

  async function confirmInitialMirrorSync() {
    return new Promise<boolean>((resolve) => {
      if (mirrorSyncConfirmResolveRef.current) {
        mirrorSyncConfirmResolveRef.current(false);
      }

      mirrorSyncConfirmResolveRef.current = resolve;
      setIsMirrorSyncConfirmOpen(true);
    });
  }

  function resolveInitialMirrorSyncConfirmation(shouldSync: boolean) {
    setIsMirrorSyncConfirmOpen(false);

    const resolve = mirrorSyncConfirmResolveRef.current;
    mirrorSyncConfirmResolveRef.current = null;
    resolve?.(shouldSync);
  }

  async function confirmMirrorParitySync() {
    return new Promise<boolean>((resolve) => {
      if (mirrorParityConfirmResolveRef.current) {
        mirrorParityConfirmResolveRef.current(false);
      }

      mirrorParityConfirmResolveRef.current = resolve;
      setIsMirrorParityConfirmOpen(true);
    });
  }

  function resolveMirrorParitySyncConfirmation(shouldSync: boolean) {
    setIsMirrorParityConfirmOpen(false);

    const resolve = mirrorParityConfirmResolveRef.current;
    mirrorParityConfirmResolveRef.current = null;
    resolve?.(shouldSync);
  }

  async function confirmDecompressBeforeLaunch(gameName: string, versionName: string) {
    return new Promise<boolean>((resolve) => {
      if (decompressLaunchConfirmResolveRef.current) {
        decompressLaunchConfirmResolveRef.current(false);
      }

      decompressLaunchConfirmResolveRef.current = resolve;
      setDecompressLaunchConfirmContext({ gameName, versionName });
    });
  }

  function resolveDecompressBeforeLaunchConfirmation(shouldDecompress: boolean) {
    setDecompressLaunchConfirmContext(null);

    const resolve = decompressLaunchConfirmResolveRef.current;
    decompressLaunchConfirmResolveRef.current = null;
    resolve?.(shouldDecompress);
  }

  async function decompressVersionForLaunch(
    gamePath: string,
    gameName: string,
    versionPath: string,
    versionName: string,
  ) {
    await decompressVersion(gamePath, gameName, versionPath, versionName);
  }

  async function runMirrorParitySync() {
    if (!config?.metadataMirrorRoot.trim()) {
      setStatus(t('status.metadataMirrorRootRequiredForParitySync'));
      return;
    }

    const shouldSync = await confirmMirrorParitySync();
    if (!shouldSync) {
      return;
    }

    const result = await refreshScan('parity-sync');
    if (!result) {
      return;
    }

    setStatus(t('status.metadataMirrorParitySyncCompleted', { count: result.games.length }));
  }

  // Lifecycle orchestrator: bootstraps config/version and setup/save/view-mode flows.
  const {
    pickRoot,
    pickMetadataMirrorRoot,
    saveConfig,
    changeViewMode,
  } = useAppLifecycleHandlers({
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
  });

  // High-frequency game actions shared by cards, detail view, and context menus.
  const {
    handlePlayClick,
    handlePlayWithVersionPromptClick,
    playGame,
    handleOpenDetail,
    openGameDetailFromPath,
    openFolderInExplorer,
    toggleGameSelection,
  } = useGameActions({
    games: scanResult.games,
    canLaunch,
    launchBlockedMessage,
    setStatus,
    setDetailGamePath,
    setSelectedGamePath,
    refreshScan,
    confirmDecompressBeforeLaunch,
    decompressVersionBeforeLaunch: decompressVersionForLaunch,
    logAppEvent,
    toErrorMessage,
  });

  const handleGameSelection = (gamePath: string) => {
    if (isNarrowViewport) {
      openGameDetailFromPath(gamePath);
      return;
    }

    toggleGameSelection(gamePath);
  };

  // Every status-bar message is mirrored to logs for time-ordered event history.
  useEffect(() => {
    // Mirror user-facing status updates into logs for postmortem troubleshooting.
    void logAppEvent(status, 'info', 'status-bar');
  }, [status]);

  useStartupTagPoolSync({
    config,
    scanResult,
    setConfig,
    setStatus,
    logAppEvent,
    toErrorMessage,
  });

  useGlobalShortcuts({
    setConfig,
    searchInputRef,
    isScanning,
    refreshScan,
    screenshotModalPath,
    setScreenshotModalPath,
  });

  async function refreshScan(mode: RefreshScanMode = 'scan-and-sync') {
    if (scanInFlightRef.current) {
      return scanInFlightRef.current;
    }

    const isFallbackRecoveryProbe = mode === 'fallback-recovery-probe';
    const shouldSyncMirror = mode === 'scan-and-sync' || mode === 'parity-sync';
    const shouldMirrorParity = mode === 'parity-sync';
    if (!isFallbackRecoveryProbe) {
      setScanProgress(0.06);
    }

    // Central scan gateway used by setup save, manual refresh, and post-action sync.
    const startedAtMs = Date.now();
    const scanPromise = (async () => {
      if (!isFallbackRecoveryProbe) {
        setIsScanning(true);
        void logAppEvent(
          `Scan started (mode=${mode}, sync=${shouldSyncMirror ? 'enabled' : 'disabled'}, parity=${shouldMirrorParity ? 'full' : 'safe-media-preserve'}).`,
          'info',
          'scan-orchestrator',
        );
      }

      try {
        const result = await galleryClient.scanGames({
          syncMirror: shouldSyncMirror,
          mirrorParity: shouldMirrorParity,
        });

        if (isFallbackRecoveryProbe) {
          if (!result.usingMirrorFallback) {
            setScanResult(result);
            setStatus(result.games.length ? t('status.foundGameFolders', { count: result.games.length }) : t('status.scanCompletedNoMatches'));
            void logAppEvent(
              `Primary game folder recovered automatically (games=${result.games.length}).`,
              'info',
              'fallback-probe',
            );
          }

          return result;
        }

        setScanResult(result);
        setStatus(result.games.length ? t('status.foundGameFolders', { count: result.games.length }) : t('status.scanCompletedNoMatches'));

        const elapsedMs = Date.now() - startedAtMs;
        const completionLevel = result.warnings.length ? 'warn' : 'info';
        void logAppEvent(
          `Scan completed in ${elapsedMs}ms (mode=${mode}, games=${result.games.length}, warnings=${result.warnings.length}, parity=${shouldMirrorParity ? 'full' : 'safe-media-preserve'}).`,
          completionLevel,
          'scan-orchestrator',
        );

        for (const warning of result.warnings) {
          void logAppEvent(warning, 'warn', 'scan-warning');
        }

        return result;
      } catch (error) {
        if (isFallbackRecoveryProbe) {
          return null;
        }

        // Reset to empty snapshot so stale scan data is not shown after failures.
        setScanResult(emptyScan);
        const logMessage = toErrorMessage(error, 'Failed to scan game folders.');
        const elapsedMs = Date.now() - startedAtMs;
        setStatus(t('status.failedScanGameFolders'));
        void logAppEvent(`${logMessage} (after ${elapsedMs}ms)`, 'error', 'scan-games');
        return null;
      } finally {
        scanInFlightRef.current = null;
        if (!isFallbackRecoveryProbe) {
          setIsScanning(false);
        }
      }
    })();

    scanInFlightRef.current = scanPromise;
    return scanPromise;
  }

  refreshScanRef.current = refreshScan;

  useEffect(() => {
    if (!isUsingMirrorFallback || !config?.gamesRoot.trim()) {
      return;
    }

    const runFallbackRecoveryProbe = () => {
      const runScan = refreshScanRef.current;
      if (!runScan) {
        return;
      }

      void runScan('fallback-recovery-probe');
    };

    runFallbackRecoveryProbe();
    const probeInterval = window.setInterval(runFallbackRecoveryProbe, fallbackRecoveryProbeIntervalMs);

    return () => {
      window.clearInterval(probeInterval);
    };
  }, [config?.gamesRoot, isUsingMirrorFallback]);

  const {
    activeTagSuggestions,
    applyTagSuggestion,
    handleTagAutocompleteKeyDown,
  } = useTagAutocompleteManager({
    config,
    draftTagRules,
    metadataDraft,
    activeTagAutocomplete,
    setActiveTagAutocomplete,
    setConfig,
    setDraftTagRules,
    setMetadataDraft,
    persistTagPool,
  });

  const {
    onRemoveTag,
    onFinalizeTagPoolEdit,
    onTagPoolEditorKeyDown,
    onApplyTagPoolSuggestion,
    onStartEditRule,
    onRemoveRule,
    onFinalizeRuleBlur,
    onHandleRuleKeyDown,
    onUpdateRule,
    onApplyRuleSuggestion,
    onAddRule,
    onAddSuggestionTag,
    onSaveCurrentFilterPreset,
    onCancelPresetNaming,
    onRenameFilterPreset,
    onDeleteFilterPreset,
  } = useTopbarPanelHandlers({
    draftTagRules,
    setDraftTagRules,
    setActiveFilterRuleEditorIndex,
    setActiveTagAutocomplete,
    handleTagAutocompleteKeyDown,
    applyTagSuggestion,
    removeTagFromPoolByIndex,
    finalizeTagPoolEdit,
    startTagPoolEdit,
    updateTagPoolEditorValue,
    addTagToPool,
    setActiveTagPoolEditorIndex,
    saveCurrentFilterPreset,
    renameFilterPreset,
    deleteFilterPreset,
    setIsPresetNamingOpen,
    setDraftPresetName,
  });

  const {
    isVersionNotificationsOpen,
    setIsVersionNotificationsOpen,
    visibleVersionMismatchGames,
    dismissVersionMismatch,
    resolveVersionMismatch,
    focusGameFromNotification,
  } = useVersionMismatchManager({
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
  });

  const {
    isVaultOpen,
    requestVaultToggle,
    visibleFilteredGames,
    effectiveTagPoolUsage,
    toggleGameVaultMembership,
    announcedMissingVaultedPaths,
    isVaultUnlockModalOpen,
    vaultPinInput,
    setVaultPinInput,
    vaultPinError,
    confirmVaultUnlock,
    cancelVaultUnlock,
    isVaultPinModalOpen,
    newVaultPinInput,
    setNewVaultPinInput,
    confirmVaultPinInput,
    setConfirmVaultPinInput,
    vaultPinModalError,
    openVaultPinEditor,
    saveVaultPin,
    removeVaultPin,
    cancelVaultPinEditor,
  } = useVaultManager({
    config,
    setConfig,
    scanResult,
    filteredGames,
    selectedGamePath,
    detailGamePath,
    setSelectedGamePath,
    setDetailGamePath,
    setScanResult,
    setStatus,
    refreshScan,
    logAppEvent,
    toErrorMessage,
    t,
    onOpenNotificationCenter: () => setIsVersionNotificationsOpen(true),
  });

  // Keep this in App because it combines outputs from two separate features:
  // 1) the list of version mismatches, and 2) whether vaulted games should be
  // hidden right now. App is the place where those feature outputs are merged
  // before being sent to the notification UI.
  const vaultAwareVersionMismatchGames = useMemo(
    () => (isVaultOpen ? visibleVersionMismatchGames : visibleVersionMismatchGames.filter((game) => !game.isVaulted)),
    [isVaultOpen, visibleVersionMismatchGames],
  );

  // Same idea as above: this suggestion list needs both current filter input
  // (what tags are already in use) and vault-aware tag counts (what is visible
  // in the current vault state). Since it merges data from multiple features,
  // we keep it here in App and pass the final list to the filter panel.
  const vaultAwareTopUsedFilterSuggestions = useMemo(() => {
    if (!config) {
      return [] as Array<{ tag: string; count: number }>;
    }

    const activeKeys = new Set(
      draftTagRules
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => (entry.startsWith('-') ? entry.slice(1).trim() : entry).toLowerCase()),
    );

    return config.tagPool
      .map((tag) => ({
        tag,
        count: Number.isFinite(effectiveTagPoolUsage[tag]) ? effectiveTagPoolUsage[tag] : 0,
      }))
      .filter((entry) => !activeKeys.has(entry.tag.toLowerCase()))
      .sort((left, right) => {
        if (left.count !== right.count) {
          return right.count - left.count;
        }

        return left.tag.localeCompare(right.tag, undefined, { sensitivity: 'base' });
      })
      .slice(0, 10);
  }, [config, draftTagRules, effectiveTagPoolUsage]);

  const {
    onToggleSystemMenuBar,
    onOpenLogViewer,
    onOpenLogFolder,
    onPickAppIcon,
    onDropAppIconFile,
    onApplyAppIconNow,
    onBackFromDetail,
    onOpenGameFolder,
    onOpenVersionFolder,
    onOpenVersionContextMenu,
    onGameCardContextMenu,
    onOpenVaultContextMenu,
  } = useAppViewHandlers({
    logAppEvent,
    openLogViewer,
    openLogFolderFromSetup,
    pickAppIconPng,
    handleDropAppIconFile,
    applyAppIconNow,
    openFolderInExplorer,
    setDetailGamePath,
    canLaunch,
    supportsNativeContextMenu,
    isVaultOpen,
    hasVaultPin: Boolean(config?.vaultPin?.trim()),
  });

  const refreshSingleGame = async (gamePath: string) => {
    try {
      const updatedGame = await galleryClient.scanGame(gamePath);
      if (!updatedGame) {
        await refreshScan('scan-only');
        return;
      }

      setScanResult((current) => {
        const currentIndex = current.games.findIndex((game) => game.path === updatedGame.path);
        if (currentIndex < 0) {
          return current;
        }

        const nextGames = [...current.games];
        nextGames[currentIndex] = updatedGame;
        return {
          ...current,
          scannedAt: new Date().toISOString(),
          games: nextGames,
        };
      });
    } catch {
      await refreshScan('scan-only');
    }
  };

  const { compressVersion, decompressVersion, compressionProgress } = useVersionStorage({
    galleryClient,
    setStatus,
    t,
    logAppEvent,
    refreshGame: refreshSingleGame,
  });

  const onCompressVersionByPath = async (versionPath: string) => {
    const game = scanResult.games.find((candidate) => candidate.versions.some((version) => version.path === versionPath));
    const version = game?.versions.find((candidate) => candidate.path === versionPath);
    if (!game || !version) {
      setStatus(t('status.unableFindSelectedGame'));
      return;
    }

    await compressVersion(game.path, game.name, version.path, version.name);
  };

  const onDecompressVersionByPath = async (versionPath: string) => {
    const game = scanResult.games.find((candidate) => candidate.versions.some((version) => version.path === versionPath));
    const version = game?.versions.find((candidate) => candidate.path === versionPath);
    if (!game || !version) {
      setStatus(t('status.unableFindSelectedGame'));
      return;
    }

    await decompressVersion(game.path, game.name, version.path, version.name);
  };

  useContextMenuListeners({
    games: scanResult.games,
    canLaunch,
    launchBlockedMessage,
    isVaultOpen,
    openGameDetailFromPath,
    openFolderInExplorer,
    openMetadataModal,
    openPicturesModal,
    playGame,
    toggleGameVaultMembership,
    openVaultPinEditor,
    removeVaultPin,
    onCompressVersion: onCompressVersionByPath,
    onDecompressVersion: onDecompressVersionByPath,
    setStatus,
  });

  const {
    renderFocusCard,
    renderGame,
    renderInlinePosterCardFocus,
  } = useGalleryRenderers({
    viewMode,
    isNarrowViewport,
    enableInlineFocus: !isNarrowViewport,
    selectedGamePath,
    filteredGames: visibleFilteredGames,
    gridColumns,
    canLaunch,
    actionLabels,
    getImageSrc: filePathToSrc,
    onToggleSelection: handleGameSelection,
    onPlayClick: handlePlayClick,
    onPlayWithVersionPromptClick: handlePlayWithVersionPromptClick,
    onOpenDetail: handleOpenDetail,
    onResolveVersionMismatch: (game, event) => {
      event.stopPropagation();
      void resolveVersionMismatch(game.path, game.name, game.detectedLatestVersion);
    },
    onGameCardContextMenu,
    focusCarouselIndexByGamePath,
    setFocusCarouselIndexByGamePath,
    setScreenshotModalPath,
  });

  // Derived selection state for list/focus panes and detail page routing.
  const selectedGame = useMemo(
    () => (isNarrowViewport ? null : visibleFilteredGames.find((game) => game.path === selectedGamePath) ?? null),
    [isNarrowViewport, visibleFilteredGames, selectedGamePath],
  );

  const detailGame = useMemo(
    () => {
      const game = scanResult.games.find((candidate) => candidate.path === detailGamePath) ?? null;
      if (!game) {
        return null;
      }

      return !isVaultOpen && game.isVaulted ? null : game;
    },
    [scanResult.games, detailGamePath, isVaultOpen],
  );

  // Dynamic scale layer: adapts typography/spacing/media to current grid density.
  const dynamicUiScaleFactor = useMemo(() => {
    if (!config?.uiDynamicGridScaling) {
      return 1;
    }

    if (viewMode !== 'poster' && viewMode !== 'card') {
      return 1;
    }

    const baselineColumns = dynamicScaleBaselineColumns[viewMode];
    const activeColumns = Math.max(1, gridColumns || baselineColumns);
    const ratio = baselineColumns / activeColumns;

    // Use a square-root curve so dense grids shrink content gradually instead of abruptly.
    return clamp(Math.pow(ratio, 0.5), 0.75, 1.25);
  }, [config?.uiDynamicGridScaling, viewMode, gridColumns]);

  const effectiveGlobalZoom = clamp(config?.uiGlobalZoom ?? 1, 0.75, 2);
  const effectiveFontScale = clamp((config?.uiBaseFontScale ?? 1) * dynamicUiScaleFactor * effectiveGlobalZoom, 0.6, 2.4);
  const effectiveSpacingScale = clamp((config?.uiBaseSpacingScale ?? 1) * dynamicUiScaleFactor * effectiveGlobalZoom, 0.6, 2.4);
  const metadataGapSetting = config?.uiMetadataGapScale ?? 1;
  const effectiveMetadataGapScale = clamp((metadataGapSetting * 0.5) * effectiveFontScale, 0.12, 3);
  const effectiveMediaScale = clamp((effectiveFontScale + effectiveSpacingScale) / 2, 0.7, 1.6);
  const contentScaleStyle = {
    // CSS custom properties let nested views scale without prop-drilling style math.
    ['--content-font-scale' as string]: effectiveFontScale.toFixed(3),
    ['--content-spacing-scale' as string]: effectiveSpacingScale.toFixed(3),
    ['--metadata-gap-scale' as string]: effectiveMetadataGapScale.toFixed(3),
    ['--content-media-scale' as string]: effectiveMediaScale.toFixed(3),
  } as CSSProperties;

  // Grid sizing reacts to container width and user column preferences.
  useResponsiveGrid({
    viewMode,
    cardsContainerRef,
    effectiveMediaScale,
    filteredGamesLength: visibleFilteredGames.length,
    detailGamePath,
    config,
    setGridColumns,
  });

  const mediaModalGame = useMemo(
    () => scanResult.games.find((candidate) => candidate.path === mediaModalGamePath) ?? null,
    [scanResult.games, mediaModalGamePath],
  );

  if (!config) {
    // Hard gate: render loading surface until initial config bootstrap finishes.
    return <main className="shell"><section className="panel panel--loading">{status}</section></main>;
  }

  const detailBackgroundSrc = detailGame ? filePathToSrc(detailGame.media.background) : null;
  const hideTopbarForDetail = isNarrowViewport && Boolean(detailGame);
  const compressionProgressLabel = compressionProgress
    ? compressionProgress.operation === 'decompress'
      ? compressionProgress.phase === 'preparing'
        ? t('detail.decompressProgressPreparing')
        : compressionProgress.phase === 'compressing'
          ? t('detail.decompressProgressDecompressing')
          : t('detail.decompressProgressFinalizing')
      : compressionProgress.phase === 'preparing'
        ? t('detail.compressProgressPreparing')
        : compressionProgress.phase === 'compressing'
          ? t('detail.compressProgressCompressing')
          : t('detail.compressProgressFinalizing')
    : '';
  return (
    <main className="shell">
      {isUsingMirrorFallback ? (
        <aside className="floating-fallback-alert" role="status" aria-live="polite">
          <p className="floating-fallback-alert__title">{t('app.mirrorFallbackBannerTitle')}</p>
          <p className="floating-fallback-alert__body">{t('app.mirrorFallbackBannerBody')}</p>
        </aside>
      ) : null}

      {compressionProgress ? (
        <aside className="floating-version-storage" role="status" aria-live="polite">
          <p className="floating-version-storage__title">{compressionProgressLabel}</p>
          <p className="floating-version-storage__body">{compressionProgress.gameName} - {compressionProgress.versionName}</p>
          <div className="floating-version-storage__meter" aria-hidden="true">
            <span
              className="floating-version-storage__meter-fill"
              style={{ transform: `scaleX(${Math.max(0, Math.min(1, compressionProgress.percent))})` }}
            />
          </div>
        </aside>
      ) : null}

      {/* Topbar flow: search + panel toggles + staged tag/filter editing surfaces. */}
      {!hideTopbarForDetail ? (
      <header className="topbar panel">
        <div className="topbar__title">
          <p className="eyebrow">{t('app.title')}</p>
          <p>{t('app.gamesFound', { count: scanResult.games.length })}</p>
        </div>
        <TopbarControls
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          searchInputRef={searchInputRef}
          isTagPoolPanelOpen={isTagPoolPanelOpen}
          isFilterPanelOpen={isFilterPanelOpen}
          isSidebarOpen={isSidebarOpen}
          isVaultOpen={isVaultOpen}
          hasVaultPin={Boolean(config.vaultPin?.trim())}
          supportsNativeContextMenu={supportsNativeContextMenu}
          isVersionNotificationsOpen={isVersionNotificationsOpen}
          isScanning={isScanning}
          versionMismatchCount={vaultAwareVersionMismatchGames.length + announcedMissingVaultedPaths.length}
          onToggleTagPoolPanel={() => setIsTagPoolPanelOpen((current) => !current)}
          onToggleFilterPanel={() => setIsFilterPanelOpen((current) => !current)}
          onToggleSidebar={() => setIsSidebarOpen((current) => !current)}
          onToggleVault={requestVaultToggle}
          onOpenVaultContextMenu={onOpenVaultContextMenu}
          onToggleVersionNotifications={() => setIsVersionNotificationsOpen((current) => !current)}
          onRescan={() => {
            void refreshScan();
          }}
          actionLabels={actionLabels}
        />
        {isVersionNotificationsOpen ? (
          <VersionMismatchPanel
            games={vaultAwareVersionMismatchGames}
            missingVaultedPaths={announcedMissingVaultedPaths}
            onOpenGame={(gamePath) => {
              focusGameFromNotification(gamePath);
            }}
            onResolve={(game) => {
              void resolveVersionMismatch(game.path, game.name, game.detectedLatestVersion);
            }}
            onDismiss={(game) => {
              void dismissVersionMismatch(game.path, game.detectedLatestVersion, game.name);
            }}
          />
        ) : null}
        <TopbarPanels
          isTagPoolPanelOpen={isTagPoolPanelOpen}
          isFilterPanelOpen={isFilterPanelOpen}
          tagPoolPanelProps={{
            tagPool: config.tagPool,
            tagPoolUsage: effectiveTagPoolUsage,
            activeTagPoolEditorIndex,
            activeTagAutocomplete,
            activeTagSuggestions,
            onStartEdit: startTagPoolEdit,
            onRemoveTag: onRemoveTag,
            onFinalizeEdit: onFinalizeTagPoolEdit,
            onEditorValueChange: updateTagPoolEditorValue,
            onSetAutocomplete: setActiveTagAutocomplete,
            onEditorKeyDown: onTagPoolEditorKeyDown,
            onApplySuggestion: onApplyTagPoolSuggestion,
            onAddTag: addTagToPool,
          }}
          filterPanelProps={{
            draftTagRules,
            activeFilterRuleEditorIndex,
            activeTagAutocomplete,
            activeTagSuggestions,
            topUsedFilterSuggestions: vaultAwareTopUsedFilterSuggestions,
            draftMinScore,
            draftOrderBy,
            draftStatus,
            orderByModeLabels,
            statusChoices: config.statusChoices,
            isPresetNamingOpen,
            draftPresetName,
            isPresetSaving,
            filterPresets: config.filterPresets,
            onSetActiveTagAutocomplete: setActiveTagAutocomplete,
            onStartEditRule,
            onRemoveRule,
            onFinalizeRuleBlur,
            onHandleRuleKeyDown,
            onUpdateRule,
            onApplyRuleSuggestion,
            onAddRule,
            onAddSuggestionTag,
            onChangeDraftMinScore: setDraftMinScore,
            onChangeDraftOrderBy: setDraftOrderBy,
            onChangeDraftStatus: setDraftStatus,
            onBeginSavePreset: beginSavePreset,
            onChangeDraftPresetName: setDraftPresetName,
            onSaveCurrentFilterPreset: onSaveCurrentFilterPreset,
            onCancelPresetNaming: onCancelPresetNaming,
            onRenameFilterPreset: onRenameFilterPreset,
            onLoadFilterPreset: loadFilterPresetToDraft,
            onDeleteFilterPreset: onDeleteFilterPreset,
            onResetStagedFilters: resetStagedFilters,
          }}
        />
        <div className={`topbar-sync-progress ${scanProgress > 0 ? 'is-visible' : ''}`} aria-hidden="true">
          <span
            className={`topbar-sync-progress__bar ${isScanning ? 'is-active' : ''}`}
            style={{ transform: `scaleX(${scanProgress})` }}
          />
        </div>
      </header>
      ) : null}

      {/* Main split flow: setup/config controls on the left, library/detail on the right. */}
      <section className={`layout ${detailGame ? 'layout--detail' : ''}`}>
        <SetupPanel
          appVersion={appVersion}
          config={config}
          isSidebarOpen={isSidebarOpen}
          isSaving={isSaving}
          isScanning={isScanning}
          isGamesRootEditable={isGamesRootEditable}
          supportsFolderPicker={supportsFolderPicker}
          chooseLibraryFolderLabel={actionLabels.chooseLibraryFolder}
          onSaveConfig={saveConfig}
          onPickRoot={pickRoot}
          onPickMetadataMirrorRoot={pickMetadataMirrorRoot}
          onRunMirrorParitySync={() => {
            void runMirrorParitySync();
          }}
          onConfigChange={setConfig}
          onToggleSystemMenuBar={onToggleSystemMenuBar}
          onOpenLogViewer={onOpenLogViewer}
          onOpenLogFolder={onOpenLogFolder}
          appIconPreviewSrc={appIconPreviewSrc}
          appIconSummary={appIconSummary}
          appIconPath={config.appIconPngPath}
          onPickAppIcon={onPickAppIcon}
          onDropAppIconFile={onDropAppIconFile}
          onAppIconDragEnter={handleAppIconDragEnter}
          onAppIconDragLeave={handleAppIconDragLeave}
          isAppIconDragActive={isAppIconDragActive}
          onApplyAppIconNow={onApplyAppIconNow}
          onResetAppIcon={resetAppIcon}
        />

        <LibraryPanel
          detailGame={detailGame}
          detailBackgroundSrc={detailBackgroundSrc}
          contentScaleStyle={contentScaleStyle}
          canLaunch={canLaunch}
          canOpenFolders={canOpenFolders}
          supportsNativeContextMenu={supportsNativeContextMenu}
          actionLabels={actionLabels}
          renderFocusCard={renderFocusCard}
          getImageSrc={filePathToSrc}
          onBackFromDetail={onBackFromDetail}
          onPlay={handlePlayClick}
          onPlayWithVersionPrompt={handlePlayWithVersionPromptClick}
          onOpenMetadata={openMetadataModal}
          onOpenGameFolder={onOpenGameFolder}
          onOpenVersionFolder={onOpenVersionFolder}
          onOpenVersionContextMenu={onOpenVersionContextMenu}
          onCompressVersion={async (gamePath, gameName, versionPath, versionName) => {
            await compressVersion(gamePath, gameName, versionPath, versionName);
          }}
          onOpenPictures={openPicturesModal}
          onOpenScreenshot={setScreenshotModalPath}
          scanResult={scanResult}
          viewMode={viewMode}
          viewModeLabels={viewModeLabels}
          onChangeViewMode={(mode) => {
            void changeViewMode(mode);
          }}
          filteredGames={visibleFilteredGames}
          selectedGame={selectedGame}
          cardsContainerRef={cardsContainerRef}
          gridColumns={gridColumns}
          renderInlinePosterCardFocus={renderInlinePosterCardFocus}
          renderGame={renderGame}
        />
      </section>

      {/* Global overlays flow: metadata/media/log/screenshot modal orchestration. */}
      <ModalHost
        games={scanResult.games}
        isMirrorSyncConfirmOpen={isMirrorSyncConfirmOpen}
        onConfirmMirrorSync={() => resolveInitialMirrorSyncConfirmation(true)}
        onCancelMirrorSync={() => resolveInitialMirrorSyncConfirmation(false)}
        isMirrorParityConfirmOpen={isMirrorParityConfirmOpen}
        onConfirmMirrorParitySync={() => resolveMirrorParitySyncConfirmation(true)}
        onCancelMirrorParitySync={() => resolveMirrorParitySyncConfirmation(false)}
        isDecompressLaunchConfirmOpen={Boolean(decompressLaunchConfirmContext)}
        decompressLaunchGameName={decompressLaunchConfirmContext?.gameName ?? ''}
        decompressLaunchVersionName={decompressLaunchConfirmContext?.versionName ?? ''}
        onConfirmDecompressLaunch={() => resolveDecompressBeforeLaunchConfirmation(true)}
        onCancelDecompressLaunch={() => resolveDecompressBeforeLaunchConfirmation(false)}
        metadataModalGamePath={metadataModalGamePath}
        metadataDraft={metadataDraft}
        statusChoices={config.statusChoices}
        activeMetadataTagEditorIndex={activeMetadataTagEditorIndex}
        activeTagAutocomplete={activeTagAutocomplete}
        activeTagSuggestions={activeTagSuggestions}
        isMetadataSaving={isMetadataSaving}
        closeMetadataModal={closeMetadataModal}
        saveMetadataChanges={saveMetadataChanges}
        setMetadataDraft={setMetadataDraft}
        setActiveMetadataTagEditorIndex={setActiveMetadataTagEditorIndex}
        setActiveTagAutocomplete={setActiveTagAutocomplete}
        handleTagAutocompleteKeyDown={handleTagAutocompleteKeyDown}
        applyTagSuggestion={applyTagSuggestion}
        mediaModalGame={mediaModalGame}
        mediaModalGamePath={mediaModalGamePath}
        isMediaSaving={isMediaSaving}
        featuredImportTarget={featuredImportTarget}
        pendingFeaturedDropPaths={pendingFeaturedDropPaths}
        dragSection={dragSection}
        draggedScreenshotPath={draggedScreenshotPath}
        dragOverScreenshotPath={dragOverScreenshotPath}
        screenshotContextMenu={screenshotContextMenu}
        filePathToSrc={filePathToSrc}
        setFeaturedImportTarget={setFeaturedImportTarget}
        setPendingFeaturedDropPaths={setPendingFeaturedDropPaths}
        setDragSection={setDragSection}
        setDraggedScreenshotPath={setDraggedScreenshotPath}
        setDragOverScreenshotPath={setDragOverScreenshotPath}
        setScreenshotContextMenu={setScreenshotContextMenu}
        closePicturesModal={closePicturesModal}
        importMedia={importMedia}
        reorderScreenshots={reorderScreenshots}
        removeScreenshot={removeScreenshot}
        isLogModalOpen={isLogModalOpen}
        isLogLoading={isLogLoading}
        isLogClearing={isLogClearing}
        filteredLogContents={filteredLogContents}
        logLevelFilter={logLevelFilter}
        logDateFilter={logDateFilter}
        closeLogViewer={closeLogViewer}
        setLogLevelFilter={setLogLevelFilter}
        setLogDateFilter={setLogDateFilter}
        clearLogsFromViewer={clearLogsFromViewer}
        screenshotModalPath={screenshotModalPath}
        setScreenshotModalPath={setScreenshotModalPath}
        isVaultUnlockModalOpen={isVaultUnlockModalOpen}
        vaultPinInput={vaultPinInput}
        vaultPinError={vaultPinError}
        setVaultPinInput={setVaultPinInput}
        confirmVaultUnlock={confirmVaultUnlock}
        cancelVaultUnlock={cancelVaultUnlock}
        isVaultPinModalOpen={isVaultPinModalOpen}
        hasExistingVaultPin={Boolean(config.vaultPin?.trim())}
        newVaultPinInput={newVaultPinInput}
        confirmVaultPinInput={confirmVaultPinInput}
        vaultPinModalError={vaultPinModalError}
        setNewVaultPinInput={setNewVaultPinInput}
        setConfirmVaultPinInput={setConfirmVaultPinInput}
        saveVaultPin={saveVaultPin}
        cancelVaultPinEditor={cancelVaultPinEditor}
      />
    </main>
  );
}

export default App;






