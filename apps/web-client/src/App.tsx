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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GalleryConfig, GalleryViewMode, ScanResult, ServiceCapabilities } from './types';
import { LibraryPanel } from './components/LibraryPanel';
import { ModalHost } from './components/ModalHost';
import { GameArchiveUploadModal } from './components/GameArchiveUploadModal';
import { SetupPanel } from './components/SetupPanel';
import { TopbarControls } from './components/TopbarControls';
import { TopbarPanels } from './components/TopbarPanels';
import { VersionMismatchPanel } from './components/VersionMismatchPanel';
import { FloatingVersionStorageToast } from './components/FloatingVersionStorageToast';
import { FloatingFallbackAlert } from './components/FloatingFallbackAlert';
import { FloatingDownloadToast } from './components/FloatingDownloadToast';
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
import { useResponsiveGrid } from './hooks/useResponsiveGrid';
import { useAppLifecycleHandlers } from './hooks/useAppLifecycleHandlers';
import { useGameActions } from './hooks/useGameActions';
import { useVersionMismatchManager } from './hooks/useVersionMismatchManager';
import { useVaultManager } from './hooks/useVaultManager';
import { useScanOrchestrator, type RefreshScanMode } from './hooks/useScanOrchestrator';
import { useFallbackRecoveryProbe } from './hooks/useFallbackRecoveryProbe';
import { useExtraDownloads } from './hooks/useExtraDownloads';
import { useVersionDownloads } from './hooks/useVersionDownloads';
import { useModalConfirmations } from './hooks/useModalConfirmations';
import { useAppUiLabels } from './hooks/useAppUiLabels';
import { useContentScale } from './hooks/useContentScale';
import { useVersionStorageActions } from './hooks/useVersionStorageActions';
import { useVersionStorageProgressLabel } from './hooks/useVersionStorageProgressLabel';
import { useDownloadProgressLabel } from './hooks/useDownloadProgressLabel';
import { useAppDerivedState } from './hooks/useAppDerivedState';
import { useGameArchiveUpload } from './hooks/useGameArchiveUpload';
import { createLogAppEvent, toErrorMessage } from './hooks/useAppRuntimeCore';
import { useServiceCapabilitiesLoader } from './hooks/useServiceCapabilitiesLoader';
import { createEmptyScan, getInitialServiceCapabilities, narrowViewportMaxWidthPx } from './hooks/appShellDefaults';
import { useAppLanguageSync } from './hooks/useAppLanguageSync';
import { useNarrowViewport } from './hooks/useNarrowViewport';
import { useDetailScrollReset } from './hooks/useDetailScrollReset';
import { useGalleryClient } from './client/context';
import { formatByteSize } from '../../shared/app-shell/utils/app-helpers';

const emptyScan: ScanResult = createEmptyScan();
const fallbackRecoveryProbeIntervalMs = 12000;
const maxConcurrentSizeRequests = 6;

function normalizeSizePathKey(value: string) {
  return String(value ?? '').trim().replace(/\\/g, '/').toLowerCase();
}

function resolveSingleGameSize(
  sizes: Record<string, number>,
  requestedPath: string,
) {
  const numericEntries = Object.entries(sizes).filter((entry) => Number.isFinite(entry[1]));
  const normalizedRequestedPath = normalizeSizePathKey(requestedPath);
  const exactEntry = numericEntries.find((entry) => normalizeSizePathKey(entry[0]) === normalizedRequestedPath);
  if (exactEntry) {
    return exactEntry[1];
  }

  if (numericEntries.length === 1) {
    return numericEntries[0][1];
  }

  return null;
}

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
  const [isSizeScanning, setIsSizeScanning] = useState(false);
  const [sizeScanCompletedCount, setSizeScanCompletedCount] = useState(0);
  const [sizeScanTotalCount, setSizeScanTotalCount] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<GalleryViewMode>('poster');
  const [selectedGamePath, setSelectedGamePath] = useState<string | null>(null);
  const [detailGamePath, setDetailGamePath] = useState<string | null>(null);
  const isNarrowViewport = useNarrowViewport(narrowViewportMaxWidthPx);
  const [gridColumns, setGridColumns] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [isTagPoolPanelOpen, setIsTagPoolPanelOpen] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [screenshotModalPath, setScreenshotModalPath] = useState<string | null>(null);
  const [focusCarouselIndexByGamePath, setFocusCarouselIndexByGamePath] = useState<Record<string, number>>({});
  const [serviceCapabilities, setServiceCapabilities] = useState<ServiceCapabilities>(() => (
    getInitialServiceCapabilities(hasDesktopBridge)
  ));
  const [activeTagAutocomplete, setActiveTagAutocomplete] = useState<{
    scope: 'pool' | 'filter' | 'metadata';
    index: number;
    highlighted: number;
  } | null>(null);
  const cardsContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const sizeScanInFlightRef = useRef<Promise<void> | null>(null);
  const sizeScanBatchIdRef = useRef(0);
  const hasAutoTriggeredSizeScanRef = useRef(false);
  const logAppEvent = createLogAppEvent(galleryClient);

  const {
    isMirrorSyncConfirmOpen,
    isMirrorParityConfirmOpen,
    decompressLaunchConfirmContext,
    confirmInitialMirrorSync,
    resolveInitialMirrorSyncConfirmation,
    confirmMirrorParitySync,
    resolveMirrorParitySyncConfirmation,
    confirmDecompressBeforeLaunch,
    resolveDecompressBeforeLaunchConfirmation,
  } = useModalConfirmations();

  useAppLanguageSync(config?.language, i18n);

  useServiceCapabilitiesLoader({
    galleryClient,
    setServiceCapabilities,
  });

  useDetailScrollReset(isNarrowViewport, detailGamePath);

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
  const canOpenFolders = serviceCapabilities.supportsLaunch;
  const supportsNativeContextMenu = serviceCapabilities.supportsNativeContextMenu;
  const isGamesRootEditable = serviceCapabilities.isGamesRootEditable !== false;
  const supportsFolderPicker = hasDesktopBridge || serviceCapabilities.supportsHostFolderPicker;

  const {
    actionLabels,
    viewModeLabels,
    orderByModeLabels,
  } = useAppUiLabels(t);

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

  const {
    refreshScan,
    refreshGame,
    refreshScanRef,
  } = useScanOrchestrator({
    galleryClient,
    emptyScan,
    t,
    setScanResult,
    setStatus,
    setIsScanning,
    setScanProgress,
    logAppEvent,
    toErrorMessage,
  });

  const runGameSizeScan = useCallback(async (gamePaths: string[]) => {
    const uniquePaths = [...new Set(gamePaths.map((entry) => String(entry ?? '').trim()).filter(Boolean))];
    if (!uniquePaths.length) {
      return;
    }

    if (sizeScanInFlightRef.current) {
      return sizeScanInFlightRef.current;
    }

    const batchId = sizeScanBatchIdRef.current + 1;
    sizeScanBatchIdRef.current = batchId;
    setIsSizeScanning(true);
    setSizeScanCompletedCount(0);
    setSizeScanTotalCount(uniquePaths.length);
    setScanResult((current) => ({
      ...current,
      games: current.games.map((game) => (
        uniquePaths.includes(game.path)
          ? { ...game, sizeBytes: null }
          : game
      )),
    }));

    const pendingPaths = [...uniquePaths];
    const workerCount = Math.max(1, Math.min(maxConcurrentSizeRequests, pendingPaths.length));
    const startedAt = Date.now();
    let resolvedCount = 0;
    let fallbackCount = 0;
    let errorCount = 0;
    let completedCount = 0;
    void logAppEvent(
      `Started size scan batch ${batchId}: ${uniquePaths.length} game(s), ${workerCount} worker(s).`,
      'info',
      'scan-game-sizes',
    );

    const inFlight = (async () => {
      try {
        const worker = async () => {
          while (pendingPaths.length > 0) {
            const nextPath = pendingPaths.shift();
            if (!nextPath) {
              continue;
            }

            try {
              const result = await galleryClient.scanGameSizes({ gamePaths: [nextPath] });
              const resolvedSize = resolveSingleGameSize(result.sizes, nextPath);
              const nextSizeValue = Number.isFinite(resolvedSize) ? resolvedSize : 0;

              if (Number.isFinite(resolvedSize)) {
                resolvedCount += 1;
              } else {
                fallbackCount += 1;
                void logAppEvent(
                  `Size scan fallback for "${nextPath}": response keys=${Object.keys(result.sizes).join(', ') || '(none)'}.`,
                  'warn',
                  'scan-game-sizes-progress',
                );
              }

              if (sizeScanBatchIdRef.current === batchId) {
                setScanResult((current) => ({
                  ...current,
                  games: current.games.map((game) => (
                    game.path === nextPath
                      ? { ...game, sizeBytes: nextSizeValue }
                      : game
                  )),
                }));
              }
            } catch (error) {
              errorCount += 1;
              const logMessage = toErrorMessage(error, `Failed to scan game size for ${nextPath}.`);
              void logAppEvent(logMessage, 'warn', 'scan-game-size-single');

              if (sizeScanBatchIdRef.current === batchId) {
                setScanResult((current) => ({
                  ...current,
                  games: current.games.map((game) => (
                    game.path === nextPath
                      ? { ...game, sizeBytes: 0 }
                      : game
                  )),
                }));
              }
            } finally {
              completedCount += 1;
              if (sizeScanBatchIdRef.current === batchId) {
                setSizeScanCompletedCount((current) => current + 1);
              }

              if (completedCount === 1 || completedCount === uniquePaths.length || completedCount % 10 === 0) {
                const percent = Math.round((completedCount / uniquePaths.length) * 100);
                void logAppEvent(
                  `Size scan batch ${batchId} progress: ${completedCount}/${uniquePaths.length} (${percent}%).`,
                  'info',
                  'scan-game-sizes-progress',
                );
              }
            }
          }
        };

        await Promise.all(Array.from({ length: workerCount }, () => worker()));
      } catch (error) {
        const logMessage = toErrorMessage(error, 'Failed to scan game sizes.');
        setStatus(t('status.failedScanGameSizes'));
        void logAppEvent(logMessage, 'warn', 'scan-game-sizes');
      } finally {
        if (sizeScanBatchIdRef.current === batchId) {
          setIsSizeScanning(false);
          setSizeScanTotalCount(0);
        }
        const durationMs = Date.now() - startedAt;
        void logAppEvent(
          `Finished size scan batch ${batchId}: resolved=${resolvedCount}, fallback=${fallbackCount}, failed=${errorCount}, durationMs=${durationMs}.`,
          errorCount > 0 ? 'warn' : 'info',
          'scan-game-sizes',
        );
        sizeScanInFlightRef.current = null;
      }
    })();

    sizeScanInFlightRef.current = inFlight;
    return inFlight;
  }, [galleryClient, logAppEvent, t]);

  const handleRescanWithSize = useCallback(async () => {
    const result = await refreshScan();
    if (!result) {
      return;
    }

    void runGameSizeScan(result.games.map((game) => game.path));
  }, [refreshScan, runGameSizeScan]);

  const handleRefreshRequest = useCallback(async () => {
    const activeDetailGamePath = String(detailGamePath ?? '').trim();
    if (activeDetailGamePath) {
      await refreshGame(activeDetailGamePath);
      await runGameSizeScan([activeDetailGamePath]);
      return;
    }

    await refreshScan();
  }, [detailGamePath, refreshGame, refreshScan, runGameSizeScan]);

  useEffect(() => {
    if (hasAutoTriggeredSizeScanRef.current) {
      return;
    }

    if (!config || !scanResult.scannedAt || isScanning || isSizeScanning) {
      return;
    }

    hasAutoTriggeredSizeScanRef.current = true;
    const initialPaths = scanResult.games.map((game) => game.path).filter(Boolean);
    void logAppEvent(
      `Triggering initial size scan on client connect: ${initialPaths.length} game(s).`,
      'info',
      'scan-game-sizes',
    );

    if (!initialPaths.length) {
      return;
    }

    void runGameSizeScan(initialPaths);
  }, [config, isScanning, isSizeScanning, logAppEvent, runGameSizeScan, scanResult.games, scanResult.scannedAt]);

  useFallbackRecoveryProbe({
    isUsingMirrorFallback,
    gamesRoot: config?.gamesRoot,
    refreshScanRef,
    intervalMs: fallbackRecoveryProbeIntervalMs,
  });

  // Domain manager: media modal state + image import/reorder/remove orchestration.
  const {
    mediaModalGamePath,
    isMediaSaving,
    mediaUploadProgress,
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
    refreshGame,
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
    isSizeOrderingEnabled: !isSizeScanning && scanResult.games.every((game) => game.sizeBytes !== null),
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
    refreshGame,
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
  });

  const {
    compressVersion,
    compressionProgress,
    onCompressVersionByPath,
    onDecompressVersionByPath,
    decompressVersionForLaunch,
  } = useVersionStorageActions({
    games: scanResult.games,
    galleryClient,
    setScanResult,
    refreshScan,
    setStatus,
    t,
    logAppEvent,
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
    onRefreshRequest: handleRefreshRequest,
    screenshotModalPath,
    setScreenshotModalPath,
  });

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

  const {
    vaultAwareVersionMismatchGames,
    vaultAwareTopUsedFilterSuggestions,
    selectedGame,
    detailGame,
    detailBackgroundSrc,
    hideTopbarForDetail,
  } = useAppDerivedState({
    isVaultOpen,
    visibleVersionMismatchGames,
    config,
    draftTagRules,
    effectiveTagPoolUsage,
    isNarrowViewport,
    visibleFilteredGames,
    selectedGamePath,
    scanResult,
    detailGamePath,
  });

  const { onDownloadExtra, extraDownloadProgress } = useExtraDownloads({
    hasDesktopBridge,
    galleryClient,
    setStatus,
    t,
    logAppEvent,
  });

  const { onDownloadVersion, versionDownloadProgress } = useVersionDownloads({
    hasDesktopBridge,
    galleryClient,
    setStatus,
    t,
    logAppEvent,
  });

  const archiveUpload = useGameArchiveUpload({
    galleryClient,
    statusChoices: config?.statusChoices ?? [],
    setStatus,
    t,
    logAppEvent,
    onImported: async (gamePath) => {
      if (gamePath) {
        setDetailGamePath(gamePath);
        setSelectedGamePath(gamePath);
      }

      await refreshScan();
    },
  });

  const { effectiveMediaScale, contentScaleStyle } = useContentScale({
    config,
    viewMode,
    gridColumns,
  });

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

  const compressionProgressLabel = useVersionStorageProgressLabel(compressionProgress, t);
  const activeDownloadProgress = extraDownloadProgress ?? versionDownloadProgress;
  const { title: downloadProgressLabel, percentText: downloadProgressPercentText } = useDownloadProgressLabel(activeDownloadProgress, t);

  if (!config) {
    // Hard gate: render loading surface until initial config bootstrap finishes.
    return <main className="shell"><section className="panel panel--loading">{status}</section></main>;
  }

  const detailBackgroundImageSrc = detailBackgroundSrc ? filePathToSrc(detailBackgroundSrc) : null;
  const hasPendingSizeValues = isSizeScanning
    || (scanResult.games.length > 0 && scanResult.games.every((game) => game.sizeBytes === null));
  const totalLibrarySizeBytes = scanResult.games.reduce((total, game) => total + (game.sizeBytes ?? 0), 0);
  const sizeScanPercent = sizeScanTotalCount > 0
    ? Math.round((sizeScanCompletedCount / sizeScanTotalCount) * 100)
    : 0;
  const totalLibrarySizeLabel = hasPendingSizeValues
    ? (isSizeScanning ? `${t('app.calculating')} (${sizeScanPercent}%)` : t('app.calculating'))
    : formatByteSize(totalLibrarySizeBytes);

  return (
    <main className="shell">
      {isUsingMirrorFallback ? <FloatingFallbackAlert title={t('app.mirrorFallbackBannerTitle')} body={t('app.mirrorFallbackBannerBody')} /> : null}

      <FloatingDownloadToast
        downloadProgress={activeDownloadProgress}
        downloadProgressLabel={downloadProgressLabel}
        downloadProgressPercentText={downloadProgressPercentText}
      />

      <FloatingVersionStorageToast
        compressionProgress={compressionProgress}
        compressionProgressLabel={compressionProgressLabel}
      />

      {/* Topbar flow: search + panel toggles + staged tag/filter editing surfaces. */}
      {!hideTopbarForDetail ? (
      <header className="topbar panel">
        <div className="topbar__title">
          <p className="eyebrow">{t('app.title')}</p>
          <p>{t('app.gamesFoundWithSize', { count: scanResult.games.length, size: totalLibrarySizeLabel })}</p>
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
          onOpenArchiveUpload={() => archiveUpload.openModal()}
          onRescan={() => {
            void handleRefreshRequest();
          }}
          onRescanWithSize={() => {
            void handleRescanWithSize();
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
            isSizeOrderingEnabled: !isSizeScanning && scanResult.games.every((game) => game.sizeBytes !== null),
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
          supportsAppIconPicker={hasDesktopBridge}
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
          detailBackgroundSrc={detailBackgroundImageSrc}
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
          onOpenArchiveUploadForGame={(gamePath, gameName) => archiveUpload.openModal(gameName, gamePath)}
          onOpenGameFolder={onOpenGameFolder}
          onOpenVersionFolder={onOpenVersionFolder}
          onOpenVersionContextMenu={onOpenVersionContextMenu}
          onCompressVersion={async (gamePath, gameName, versionPath, versionName) => {
            await compressVersion(gamePath, gameName, versionPath, versionName);
          }}
          onDecompressVersion={async (gamePath, gameName, versionPath, versionName) => {
            await decompressVersionForLaunch(gamePath, gameName, versionPath, versionName);
          }}
          onDownloadExtra={onDownloadExtra}
          onDownloadVersion={onDownloadVersion}
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
      <GameArchiveUploadModal
        isOpen={archiveUpload.isOpen}
        gameName={archiveUpload.gameName}
        isGameNameLocked={archiveUpload.isGameNameLocked}
        versionName={archiveUpload.versionName}
        tagPool={config.tagPool}
        statusChoices={archiveUpload.statusChoices}
        isAdvancedOpen={archiveUpload.isAdvancedOpen}
        score={archiveUpload.score}
        metadataStatus={archiveUpload.metadataStatus}
        description={archiveUpload.description}
        notesText={archiveUpload.notesText}
        tagsText={archiveUpload.tagsText}
        stagedFileName={archiveUpload.stagedFileName}
        isStagingFile={archiveUpload.isStagingFile}
        isImporting={archiveUpload.isImporting}
        uploadProgress={archiveUpload.uploadProgress}
        uploadPhase={archiveUpload.uploadPhase}
        isDragActive={archiveUpload.isDragActive}
        onClose={() => {
          void archiveUpload.closeModal();
        }}
        onSetGameName={archiveUpload.setGameName}
        onSetVersionName={archiveUpload.setVersionName}
        onSetIsAdvancedOpen={archiveUpload.setIsAdvancedOpen}
        onSetScore={archiveUpload.setScore}
        onSetMetadataStatus={archiveUpload.setMetadataStatus}
        onSetDescription={archiveUpload.setDescription}
        onSetNotesText={archiveUpload.setNotesText}
        onSetTagsText={archiveUpload.setTagsText}
        onSetIsDragActive={archiveUpload.setIsDragActive}
        onFileInputChange={archiveUpload.onFileInputChange}
        onRequestPickArchive={archiveUpload.onRequestPickArchive}
        onDropArchive={archiveUpload.onDropArchive}
        onSubmitImport={() => {
          void archiveUpload.onSubmitImport();
        }}
      />

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
        mediaUploadProgress={mediaUploadProgress}
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






