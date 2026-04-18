/**
 * App composition shell: wires lifecycle/hooks and delegates domain behavior to specialized hooks/components.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GalleryConfig, GalleryViewMode, ScanResult, ServiceCapabilities } from './types';
import { LibraryPanel } from './components/LibraryPanel';
import { ModalHost } from './components/ModalHost';
import { SetupPanel } from './components/SetupPanel';
import { TopbarControls } from './components/TopbarControls';
import { TopbarPanels } from './components/TopbarPanels';
import { VersionMismatchPanel } from './components/VersionMismatchPanel';
import { FloatingVersionStorageToast } from './components/FloatingVersionStorageToast';
import { FloatingFallbackAlert } from './components/FloatingFallbackAlert';
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
import { useModalConfirmations } from './hooks/useModalConfirmations';
import { useScanOrchestrator } from './hooks/useScanOrchestrator';
import { useAppUiLabels } from './hooks/useAppUiLabels';
import { useContentScale } from './hooks/useContentScale';
import { useVersionStorageActions } from './hooks/useVersionStorageActions';
import { useVersionStorageProgressLabel } from './hooks/useVersionStorageProgressLabel';
import { useAppDerivedState } from './hooks/useAppDerivedState';
import { createLogAppEvent, toErrorMessage } from './hooks/useAppRuntimeCore';
import { useServiceCapabilitiesLoader } from './hooks/useServiceCapabilitiesLoader';
import { createEmptyScan, getInitialServiceCapabilities, narrowViewportMaxWidthPx } from './hooks/appShellDefaults';
import { useAppLanguageSync } from './hooks/useAppLanguageSync';
import { useNarrowViewport } from './hooks/useNarrowViewport';
import { useDetailScrollReset } from './hooks/useDetailScrollReset';
import { useGalleryClient } from './client/context';

const emptyScan: ScanResult = createEmptyScan();

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

  const {
    isScanning,
    scanProgress,
    refreshScan,
  } = useScanOrchestrator({
    galleryClient,
    isUsingMirrorFallback: scanResult.usingMirrorFallback,
    gamesRoot: config?.gamesRoot ?? '',
    setScanResult,
    setStatus,
    logAppEvent,
    toErrorMessage,
    t,
    emptyScan,
  });

  useAppLanguageSync(config?.language, i18n);

  useServiceCapabilitiesLoader({
    galleryClient,
    setServiceCapabilities,
  });

  useDetailScrollReset(isNarrowViewport, detailGamePath);

  const isUsingMirrorFallback = scanResult.usingMirrorFallback;
  const launchBlockedMessage = isUsingMirrorFallback ? t('status.launchDisabledMirrorFallback') : null;
  const canLaunch = serviceCapabilities.supportsLaunch && !isUsingMirrorFallback;
  const canOpenFolders = serviceCapabilities.clientMode === 'desktop';
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

  const compressionProgressLabel = useVersionStorageProgressLabel(compressionProgress, t);

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
    vaultAwareVersionMismatchGames,
    vaultAwareTopUsedFilterSuggestions,
    selectedGame,
    detailGame,
    detailBackgroundPath,
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

  if (!config) {
    // Hard gate: render loading surface until initial config bootstrap finishes.
    return <main className="shell"><section className="panel panel--loading">{status}</section></main>;
  }

  const detailBackgroundSrc = filePathToSrc(detailBackgroundPath);
  return (
    <main className="shell">
      {isUsingMirrorFallback ? (
        <FloatingFallbackAlert
          title={t('app.mirrorFallbackBannerTitle')}
          body={t('app.mirrorFallbackBannerBody')}
        />
      ) : null}

      <FloatingVersionStorageToast
        compressionProgress={compressionProgress}
        compressionProgressLabel={compressionProgressLabel}
      />

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
          onCompressVersion={compressVersion}
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









