/**
 * App shell and state orchestration for Local Game Gallery.
 *
 * Entry-point flow (high level):
 * 1) Initialize persisted config/version and optionally run first scan.
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
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { FilterOrderByMode, GalleryConfig, GalleryViewMode, ScanResult } from './types';
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
import { useResponsiveGrid } from './hooks/useResponsiveGrid';
import { useAppLifecycleHandlers } from './hooks/useAppLifecycleHandlers';
import { useGameActions } from './hooks/useGameActions';
import { useVersionMismatchManager } from './hooks/useVersionMismatchManager';
import {clamp} from './utils/app-helpers';

const emptyScan: ScanResult = {
  rootPath: '',
  scannedAt: '',
  games: [],
  warnings: [],
};

const dynamicScaleBaselineColumns: Record<'poster' | 'card', number> = {
  poster: 5,
  card: 4,
};

function App() {
  const { t, i18n } = useTranslation();

  // Core app/session state, mostly persisted config + current scan/session UI state.
  const [config, setConfig] = useState<GalleryConfig | null>(null);
  const [appVersion, setAppVersion] = useState('');
  const [scanResult, setScanResult] = useState<ScanResult>(emptyScan);
  const [status, setStatus] = useState(() => t('app.loadingConfig'));
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<GalleryViewMode>('poster');
  const [selectedGamePath, setSelectedGamePath] = useState<string | null>(null);
  const [detailGamePath, setDetailGamePath] = useState<string | null>(null);
  const [gridColumns, setGridColumns] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [isTagPoolPanelOpen, setIsTagPoolPanelOpen] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [screenshotModalPath, setScreenshotModalPath] = useState<string | null>(null);
  const [focusCarouselIndexByGamePath, setFocusCarouselIndexByGamePath] = useState<Record<string, number>>({});
  const [activeTagAutocomplete, setActiveTagAutocomplete] = useState<{
    scope: 'pool' | 'filter' | 'metadata';
    index: number;
    highlighted: number;
  } | null>(null);
  const cardsContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!config?.language) {
      return;
    }

    if (i18n.language.toLowerCase().startsWith(config.language)) {
      return;
    }

    void i18n.changeLanguage(config.language);
  }, [config?.language, i18n]);

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
    topUsedFilterSuggestions,
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
    deleteFilterPreset,
    applyFiltersAndOrdering,
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
      await window.gallery.logEvent({ message, level, source });
    } catch {
      // Avoid status recursion if logging backend is unavailable.
    }
  }

  // Lifecycle orchestrator: bootstraps config/version and setup/save/view-mode flows.
  const {
    pickRoot,
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
    setStatus,
    setDetailGamePath,
    setSelectedGamePath,
    refreshScan,
    logAppEvent,
    toErrorMessage,
  });

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

  useContextMenuListeners({
    games: scanResult.games,
    openGameDetailFromPath,
    openFolderInExplorer,
    openMetadataModal,
    openPicturesModal,
    playGame,
    setStatus,
  });

  async function refreshScan() {
    // Central scan gateway used by setup save, manual refresh, and post-action sync.
    setIsScanning(true);
    try {
      const result = await window.gallery.scanGames();
      setScanResult(result);
      setStatus(result.games.length ? t('status.foundGameFolders', { count: result.games.length }) : t('status.scanCompletedNoMatches'));
      return result;
    } catch (error) {
      // Reset to empty snapshot so stale scan data is not shown after failures.
      setScanResult(emptyScan);
      const logMessage = toErrorMessage(error, 'Failed to scan game folders.');
      setStatus(t('status.failedScanGameFolders'));
      void logAppEvent(logMessage, 'error', 'scan-games');
      return null;
    } finally {
      setIsScanning(false);
    }
  }

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
    deleteFilterPreset,
    setIsPresetNamingOpen,
    setDraftPresetName,
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
  } = useAppViewHandlers({
    logAppEvent,
    openLogViewer,
    openLogFolderFromSetup,
    pickAppIconPng,
    handleDropAppIconFile,
    applyAppIconNow,
    openFolderInExplorer,
    setDetailGamePath,
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
    renderFocusCard,
    renderGame,
    renderInlinePosterCardFocus,
  } = useGalleryRenderers({
    viewMode,
    selectedGamePath,
    filteredGames,
    gridColumns,
    actionLabels,
    getImageSrc: filePathToSrc,
    onToggleSelection: toggleGameSelection,
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
    () => filteredGames.find((game) => game.path === selectedGamePath) ?? null,
    [filteredGames, selectedGamePath],
  );

  const detailGame = useMemo(
    () => scanResult.games.find((game) => game.path === detailGamePath) ?? null,
    [scanResult.games, detailGamePath],
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
    filteredGamesLength: filteredGames.length,
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
  return (
    <main className="shell">
      {/* Topbar flow: search + panel toggles + staged tag/filter editing surfaces. */}
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
          isVersionNotificationsOpen={isVersionNotificationsOpen}
          isScanning={isScanning}
          versionMismatchCount={visibleVersionMismatchGames.length}
          onToggleTagPoolPanel={() => setIsTagPoolPanelOpen((current) => !current)}
          onToggleFilterPanel={() => setIsFilterPanelOpen((current) => !current)}
          onToggleSidebar={() => setIsSidebarOpen((current) => !current)}
          onToggleVersionNotifications={() => setIsVersionNotificationsOpen((current) => !current)}
          onRescan={() => {
            void refreshScan();
          }}
          actionLabels={actionLabels}
        />
        {isVersionNotificationsOpen ? (
          <VersionMismatchPanel
            games={visibleVersionMismatchGames}
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
            tagPoolUsage: config.tagPoolUsage,
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
            topUsedFilterSuggestions,
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
            onLoadFilterPreset: loadFilterPresetToDraft,
            onDeleteFilterPreset: onDeleteFilterPreset,
            onResetStagedFilters: resetStagedFilters,
            onApplyFiltersAndOrdering: applyFiltersAndOrdering,
          }}
        />
      </header>

      {/* Main split flow: setup/config controls on the left, library/detail on the right. */}
      <section className={`layout ${detailGame ? 'layout--detail' : ''}`}>
        <SetupPanel
          appVersion={appVersion}
          config={config}
          isSidebarOpen={isSidebarOpen}
          isSaving={isSaving}
          chooseLibraryFolderLabel={actionLabels.chooseLibraryFolder}
          onSaveConfig={saveConfig}
          onPickRoot={pickRoot}
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
          onOpenPictures={openPicturesModal}
          onOpenScreenshot={setScreenshotModalPath}
          scanResult={scanResult}
          viewMode={viewMode}
          viewModeLabels={viewModeLabels}
          onChangeViewMode={(mode) => {
            void changeViewMode(mode);
          }}
          filteredGames={filteredGames}
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
      />
    </main>
  );
}

export default App;
