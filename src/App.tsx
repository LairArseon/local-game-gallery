import { FormEvent, Fragment, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, FolderOpen, Play, RefreshCw, Settings, SlidersHorizontal, Tag } from 'lucide-react';
import type { FilterOrderByMode, FilterPreset, GalleryConfig, GalleryViewMode, GameMetadata, GameSummary, ScanResult } from './types';

const emptyScan: ScanResult = {
  rootPath: '',
  scannedAt: '',
  games: [],
  warnings: [],
};

const viewModeLabels: Record<GalleryViewMode, string> = {
  poster: 'Poster',
  card: 'Card',
  compact: 'Compact',
  expanded: 'Expanded',
};

const gridGapPx = 18;
const gridMinCardWidthPx: Record<GalleryViewMode, number> = {
  poster: 210,
  card: 320,
  compact: 1,
  expanded: 1,
};

const dynamicScaleBaselineColumns: Record<'poster' | 'card', number> = {
  poster: 5,
  card: 4,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

const orderByModeLabels: Record<FilterOrderByMode, string> = {
  'alpha-asc': 'Alphabetically up',
  'alpha-desc': 'Alphabetically down',
  'score-asc': 'Score up',
  'score-desc': 'Score down',
};

const actionLabels = {
  play: 'Play',
  open: 'Open',
  back: 'Back',
  rescan: 'Rescan',
  scanning: 'Scanning...',
  showTagPool: 'Show tag pool',
  hideTagPool: 'Hide tag pool',
  showFilters: 'Show filters',
  hideFilters: 'Hide filters',
  showSetup: 'Show setup',
  hideSetup: 'Hide setup',
  chooseLibraryFolder: 'Choose library folder',
  saving: 'Saving...',
} as const;

type CustomSelectOption = {
  value: string;
  label: string;
};

type CustomSelectProps = {
  value: string;
  options: CustomSelectOption[];
  ariaLabel: string;
  onChange: (value: string) => void;
  className?: string;
};

function CustomSelect({ value, options, ariaLabel, onChange, className }: CustomSelectProps) {
  const menuId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));

  useEffect(() => {
    setHighlightedIndex(selectedIndex);
  }, [selectedIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (rootRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    optionRefs.current[highlightedIndex]?.focus();
  }, [highlightedIndex, isOpen]);

  function moveHighlight(delta: number) {
    setHighlightedIndex((current) => {
      if (!options.length) {
        return 0;
      }

      return (current + delta + options.length) % options.length;
    });
  }

  function commitHighlightedOption() {
    const nextOption = options[highlightedIndex];
    if (!nextOption) {
      return;
    }

    onChange(nextOption.value);
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!isOpen) {
        setHighlightedIndex(selectedIndex);
        setIsOpen(true);
        return;
      }

      moveHighlight(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) {
        setHighlightedIndex(selectedIndex);
        setIsOpen(true);
        return;
      }

      moveHighlight(-1);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }

      commitHighlightedOption();
      return;
    }

    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      setIsOpen(false);
    }
  }

  function handleMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveHighlight(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveHighlight(-1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setHighlightedIndex(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setHighlightedIndex(Math.max(0, options.length - 1));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      commitHighlightedOption();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (event.key === 'Tab') {
      setIsOpen(false);
    }
  }

  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  return (
    <div className={`custom-select ${className ?? ''}`.trim()} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="custom-select__trigger"
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-activedescendant={isOpen ? `${menuId}-option-${highlightedIndex}` : undefined}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{selectedOption?.label ?? ''}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {isOpen ? (
        <div className="custom-select__menu" id={menuId} role="listbox" aria-label={ariaLabel} onKeyDown={handleMenuKeyDown}>
          {options.map((option, index) => (
            <button
              key={option.value || '__empty__'}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              id={`${menuId}-option-${index}`}
              type="button"
              role="option"
              aria-selected={value === option.value}
              tabIndex={index === highlightedIndex ? 0 : -1}
              className={`custom-select__option ${value === option.value ? 'custom-select__option--selected' : ''}`}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
                triggerRef.current?.focus();
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function App() {
  const [config, setConfig] = useState<GalleryConfig | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult>(emptyScan);
  const [status, setStatus] = useState('Loading configuration...');
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
  const [activeTagPoolEditorIndex, setActiveTagPoolEditorIndex] = useState<number | null>(null);
  const [tagPoolEditorOriginalValue, setTagPoolEditorOriginalValue] = useState('');
  const [draftTagRules, setDraftTagRules] = useState<string[]>([]);
  const [activeFilterRuleEditorIndex, setActiveFilterRuleEditorIndex] = useState<number | null>(null);
  const [activeMetadataTagEditorIndex, setActiveMetadataTagEditorIndex] = useState<number | null>(null);
  const [draftMinScore, setDraftMinScore] = useState('');
  const [draftStatus, setDraftStatus] = useState('');
  const [draftOrderBy, setDraftOrderBy] = useState<FilterOrderByMode>('alpha-asc');
  const [isPresetNamingOpen, setIsPresetNamingOpen] = useState(false);
  const [draftPresetName, setDraftPresetName] = useState('');
  const [isPresetSaving, setIsPresetSaving] = useState(false);
  const [appliedTagRules, setAppliedTagRules] = useState<string[]>([]);
  const [appliedMinScore, setAppliedMinScore] = useState<number | null>(null);
  const [appliedStatus, setAppliedStatus] = useState('');
  const [appliedOrderBy, setAppliedOrderBy] = useState<FilterOrderByMode>('alpha-asc');
  const [metadataModalGamePath, setMetadataModalGamePath] = useState<string | null>(null);
  const [mediaModalGamePath, setMediaModalGamePath] = useState<string | null>(null);
  const [screenshotModalPath, setScreenshotModalPath] = useState<string | null>(null);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [logContents, setLogContents] = useState('');
  const [isLogLoading, setIsLogLoading] = useState(false);
  const [isLogClearing, setIsLogClearing] = useState(false);
  const [logLevelFilter, setLogLevelFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [logDateFilter, setLogDateFilter] = useState('');
  const [focusCarouselIndexByGamePath, setFocusCarouselIndexByGamePath] = useState<Record<string, number>>({});
  const [metadataDraft, setMetadataDraft] = useState<GameMetadata | null>(null);
  const [isMetadataSaving, setIsMetadataSaving] = useState(false);
  const [isMediaSaving, setIsMediaSaving] = useState(false);
  const [mediaRenderVersion, setMediaRenderVersion] = useState(0);
  const [featuredImportTarget, setFeaturedImportTarget] = useState<'poster' | 'card' | 'background' | null>(null);
  const [pendingFeaturedDropPaths, setPendingFeaturedDropPaths] = useState<string[]>([]);
  const [dragSection, setDragSection] = useState<'featured' | 'gallery' | null>(null);
  const [draggedScreenshotPath, setDraggedScreenshotPath] = useState<string | null>(null);
  const [dragOverScreenshotPath, setDragOverScreenshotPath] = useState<string | null>(null);
  const [screenshotContextMenu, setScreenshotContextMenu] = useState<{ x: number; y: number; imagePath: string } | null>(null);
  const [activeTagAutocomplete, setActiveTagAutocomplete] = useState<{
    scope: 'pool' | 'filter' | 'metadata';
    index: number;
    highlighted: number;
  } | null>(null);
  const cardsContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const didRunStartupTagPoolSyncRef = useRef(false);

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

  useEffect(() => {
    void initialize();
  }, []);

  const filteredLogContents = useMemo(() => {
    if (!logContents.trim()) {
      return '';
    }

    const lines = logContents.split(/\r?\n/).filter(Boolean);
    const filtered = lines.filter((line) => {
      const matchesLevel = logLevelFilter === 'all' || line.includes(`[${logLevelFilter.toUpperCase()}]`);
      const matchesDate = !logDateFilter || line.startsWith(`[${logDateFilter}`);
      return matchesLevel && matchesDate;
    });

    return filtered.join('\n');
  }, [logContents, logDateFilter, logLevelFilter]);

  useEffect(() => {
    if (!screenshotContextMenu) {
      return;
    }

    const closeMenu = () => {
      setScreenshotContextMenu(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setScreenshotContextMenu(null);
      }
    };

    window.addEventListener('click', closeMenu);
    window.addEventListener('contextmenu', closeMenu);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('contextmenu', closeMenu);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [screenshotContextMenu]);

  useEffect(() => {
    void logAppEvent(status, 'info', 'status-bar');
  }, [status]);

  useEffect(() => {
    if (didRunStartupTagPoolSyncRef.current) {
      return;
    }

    if (!config?.gamesRoot || !scanResult.scannedAt) {
      return;
    }

    didRunStartupTagPoolSyncRef.current = true;

    const startupTagPoolSync = async () => {
      const gameTagSets = scanResult.games.map((game) =>
        new Set(game.metadata.tags.map((tag) => tag.trim()).filter(Boolean).map((tag) => tag.toLowerCase())),
      );
      const usageByKey = new Map<string, number>();
      for (const tagSet of gameTagSets) {
        for (const key of tagSet) {
          usageByKey.set(key, (usageByKey.get(key) ?? 0) + 1);
        }
      }

      const libraryTags = normalizeTagPool(scanResult.games.flatMap((game) => game.metadata.tags));
      const mergedTagPool = normalizeTagPool([...(config.tagPool ?? []), ...libraryTags]);
      const tagPoolUsage = Object.fromEntries(
        mergedTagPool.map((tag) => [tag, usageByKey.get(tag.toLowerCase()) ?? 0]),
      );

      const isTagPoolSame = JSON.stringify(mergedTagPool) === JSON.stringify(config.tagPool ?? []);
      const isUsageSame = JSON.stringify(tagPoolUsage) === JSON.stringify(config.tagPoolUsage ?? {});
      if (isTagPoolSame && isUsageSame) {
        return;
      }

      try {
        const savedConfig = await window.gallery.saveConfig({
          ...config,
          tagPool: mergedTagPool,
          tagPoolUsage,
        });
        setConfig(savedConfig);
      } catch (error) {
        const message = toErrorMessage(error, 'Failed to sync startup tag pool.');
        setStatus(message);
        void logAppEvent(message, 'error', 'startup-tag-pool-sync');
      }
    };

    void startupTagPoolSync();
  }, [config, scanResult.scannedAt, scanResult.games]);

  async function initialize() {
    try {
      const loadedConfig = await window.gallery.getConfig();
      setConfig(loadedConfig);
      await window.gallery.setMenuBarVisibility(loadedConfig.showSystemMenuBar);
      setViewMode(loadedConfig.preferredViewMode ?? 'poster');
      setIsSidebarOpen(!loadedConfig.gamesRoot);
      setStatus(loadedConfig.gamesRoot ? 'Ready to scan your library.' : 'Pick a root folder to begin.');

      if (loadedConfig.gamesRoot) {
        await refreshScan();
      }
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to load configuration.');
      setStatus(message);
      void logAppEvent(message, 'error', 'initialize');
    }
  }

  async function pickRoot() {
    try {
      const selectedPath = await window.gallery.pickGamesRoot();
      if (!selectedPath || !config) {
        return;
      }

      setIsSaving(true);
      const savedConfig = await window.gallery.saveConfig({
        ...config,
        gamesRoot: selectedPath,
      });
      setConfig(savedConfig);
      setStatus('Library folder saved.');
      await refreshScan();
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to open folder picker.');
      setStatus(message);
      void logAppEvent(message, 'error', 'pick-root');
    } finally {
      setIsSaving(false);
    }
  }

  async function saveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config) {
      return;
    }

    setIsSaving(true);
    try {
      const savedConfig = await window.gallery.saveConfig({
        ...config,
        excludePatterns: config.excludePatterns.filter(Boolean),
      });
      setConfig(savedConfig);
      await window.gallery.setMenuBarVisibility(savedConfig.showSystemMenuBar);
      setStatus('Configuration saved.');
      setIsSidebarOpen(false);
      await refreshScan();
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to save configuration.');
      setStatus(message);
      void logAppEvent(message, 'error', 'save-config');
    } finally {
      setIsSaving(false);
    }
  }

  async function refreshScan() {
    setIsScanning(true);
    try {
      const result = await window.gallery.scanGames();
      setScanResult(result);
      setStatus(result.games.length ? `Found ${result.games.length} game folders.` : 'Scan completed. No games matched yet.');
      return result;
    } catch (error) {
      setScanResult(emptyScan);
      const message = toErrorMessage(error, 'Failed to scan game folders.');
      setStatus(message);
      void logAppEvent(message, 'error', 'scan-games');
      return null;
    } finally {
      setIsScanning(false);
    }
  }

  async function changeViewMode(mode: GalleryViewMode) {
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
      setStatus('Failed to persist selected view mode.');
      void logAppEvent('Failed to persist selected view mode.', 'warn', 'change-view-mode');
    }
  }

  function handlePlayClick(game: GameSummary, event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    void playGame(game);
  }

  async function playGame(game: GameSummary) {
    try {
      const result = await window.gallery.playGame({
        gamePath: game.path,
        gameName: game.name,
        versions: game.versions.map((version) => ({
          name: version.name,
          path: version.path,
        })),
      });
      setStatus(result.message);
      if (result.launched) {
        await refreshScan();
      }
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to launch game.');
      setStatus(message);
      void logAppEvent(message, 'error', 'play-game');
    }
  }

  function handleOpenDetail(game: GameSummary, event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setDetailGamePath(game.path);
    setSelectedGamePath(game.path);
  }

  function openGameDetailFromPath(gamePath: string) {
    const game = scanResult.games.find((candidate) => candidate.path === gamePath);
    if (!game) {
      return;
    }

    setDetailGamePath(game.path);
    setSelectedGamePath(game.path);
  }

  async function openFolderInExplorer(folderPath: string) {
    try {
      const result = await window.gallery.openFolder({ folderPath });
      setStatus(result.message);
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to open folder.');
      setStatus(message);
      void logAppEvent(message, 'error', 'open-folder');
    }
  }

  async function openLogViewer() {
    setIsLogModalOpen(true);
    setIsLogLoading(true);
    try {
      const contents = await window.gallery.getLogContents();
      setLogContents(contents);
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to load log contents.');
      setLogContents(message);
      setStatus(message);
      void logAppEvent(message, 'error', 'log-viewer');
    } finally {
      setIsLogLoading(false);
    }
  }

  async function clearLogsFromViewer() {
    const confirmed = window.confirm('Clear all logs? This cannot be undone.');
    if (!confirmed) {
      return;
    }

    setIsLogClearing(true);
    try {
      await window.gallery.clearLogContents();
      setLogContents('');
      setStatus('Logs cleared.');
      void logAppEvent('Logs cleared by user.', 'warn', 'log-viewer');
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to clear logs.');
      setStatus(message);
      void logAppEvent(message, 'error', 'log-viewer');
    } finally {
      setIsLogClearing(false);
    }
  }

  async function openLogFolderFromSetup() {
    try {
      const result = await window.gallery.openLogFolder();
      setStatus(result.message);
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to open logs folder.');
      setStatus(message);
      void logAppEvent(message, 'error', 'open-log-folder');
    }
  }

  function openMetadataModal(gamePath: string) {
    const game = scanResult.games.find((candidate) => candidate.path === gamePath);
    if (!game) {
      return;
    }

    setMetadataDraft({
      latestVersion: game.metadata.latestVersion,
      score: game.metadata.score,
      status: game.metadata.status,
      description: game.metadata.description,
      notes: [...game.metadata.notes],
      tags: [...game.metadata.tags],
      launchExecutable: game.metadata.launchExecutable,
      customTags: game.metadata.customTags.map((tag) => ({ ...tag })),
    });
    setActiveMetadataTagEditorIndex(null);
    setActiveTagAutocomplete(null);
    setMetadataModalGamePath(gamePath);
  }

  function closeMetadataModal() {
    setMetadataModalGamePath(null);
    setActiveMetadataTagEditorIndex(null);
    setActiveTagAutocomplete((current) => (current?.scope === 'metadata' ? null : current));
  }

  function openPicturesModal(gamePath: string) {
    setFeaturedImportTarget(null);
    setPendingFeaturedDropPaths([]);
    setDraggedScreenshotPath(null);
    setDragOverScreenshotPath(null);
    setScreenshotContextMenu(null);
    setMediaModalGamePath(gamePath);
  }

  function extractDroppedFilePaths(event: React.DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer.files)
      .map((file) => (file as File & { path?: string }).path)
      .filter((value): value is string => Boolean(value));
  }

  function extractDraggedScreenshotPath(event: React.DragEvent<HTMLElement>) {
    const pathFromTransfer = event.dataTransfer.getData('application/x-local-gallery-screenshot').trim();
    if (pathFromTransfer) {
      return pathFromTransfer;
    }

    const fallbackText = event.dataTransfer.getData('text/plain').trim();
    return fallbackText || null;
  }

  async function saveMetadataChanges() {
    const game = scanResult.games.find((candidate) => candidate.path === metadataModalGamePath);
    if (!game || !metadataDraft) {
      return;
    }

    const normalizedMetadataTags = normalizeTagPool(metadataDraft.tags);

    setIsMetadataSaving(true);
    try {
      await window.gallery.saveGameMetadata({
        gamePath: game.path,
        title: game.name,
        metadata: {
          ...metadataDraft,
          notes: metadataDraft.notes.length ? metadataDraft.notes : [''],
          tags: normalizedMetadataTags,
        },
      });

      if (config) {
        const existingKeys = new Set(config.tagPool.map((tag) => tag.trim().toLowerCase()).filter(Boolean));
        const missingTags = normalizedMetadataTags.filter((tag) => !existingKeys.has(tag.toLowerCase()));
        if (missingTags.length) {
          const nextTagPool = [...config.tagPool, ...missingTags];
          const nextUsage = { ...config.tagPoolUsage };
          for (const tag of missingTags) {
            nextUsage[tag] = nextUsage[tag] ?? 0;
          }

          const savedConfig = await window.gallery.saveConfig({
            ...config,
            tagPool: nextTagPool,
            tagPoolUsage: nextUsage,
          });
          setConfig(savedConfig);
        }
      }

      await refreshScan();
      closeMetadataModal();
      setStatus('Metadata saved.');
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to save metadata.');
      setStatus(message);
      void logAppEvent(message, 'error', 'save-metadata');
    } finally {
      setIsMetadataSaving(false);
    }
  }

  async function importMedia(target: 'poster' | 'card' | 'background' | 'screenshot', filePaths?: string[]) {
    if (!mediaModalGamePath) {
      return;
    }

    setIsMediaSaving(true);
    try {
      if (filePaths?.length) {
        await window.gallery.importDroppedGameMedia({
          gamePath: mediaModalGamePath,
          target,
          filePaths,
        });
      } else {
        await window.gallery.importGameMediaFromDialog({
          gamePath: mediaModalGamePath,
          target,
        });
      }

      await refreshScan();
      setMediaRenderVersion((current) => current + 1);
      setFeaturedImportTarget(null);
      setPendingFeaturedDropPaths([]);
      setStatus('Pictures updated.');
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to import pictures.');
      setStatus(message);
      void logAppEvent(message, 'error', 'import-media');
    } finally {
      setIsMediaSaving(false);
    }
  }

  async function reorderScreenshots(fromPath: string, toPath: string) {
    if (!mediaModalGamePath) {
      return;
    }

    setIsMediaSaving(true);
    try {
      await window.gallery.reorderScreenshots({ fromPath, toPath });
      await refreshScan();
      setMediaRenderVersion((current) => current + 1);
      setStatus('Screenshots reordered.');
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to reorder screenshots.');
      setStatus(message);
      void logAppEvent(message, 'error', 'reorder-screenshots');
    } finally {
      setIsMediaSaving(false);
    }
  }

  async function removeScreenshot(imagePath: string) {
    if (!mediaModalGamePath) {
      return;
    }

    setScreenshotContextMenu(null);

    setIsMediaSaving(true);
    try {
      await window.gallery.removeScreenshot({ screenshotPath: imagePath });
      await refreshScan();
      setMediaRenderVersion((current) => current + 1);
      setStatus('Screenshot removed.');
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to remove screenshot.');
      setStatus(message);
      void logAppEvent(message, 'error', 'remove-screenshot');
    } finally {
      setIsMediaSaving(false);
    }
  }

  function filePathToSrc(filePath: string | null) {
    if (!filePath) {
      return null;
    }

    const base = encodeURI(`file:///${filePath.replace(/\\/g, '/')}`);
    return `${base}?v=${mediaRenderVersion}`;
  }

  function formatLastPlayed(value: string | null) {
    if (!value) {
      return 'Never';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return parsed.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function toggleGameSelection(path: string) {
    setSelectedGamePath((current) => (current === path ? null : path));
  }

  function normalizeTagRules(rules: string[]) {
    return rules.map((entry) => entry.trim()).filter(Boolean);
  }

  function normalizeTagPool(pool: string[]) {
    const uniqueTags = new Map<string, string>();
    for (const tag of pool) {
      const normalized = tag.trim();
      if (!normalized) {
        continue;
      }

      const key = normalized.toLowerCase();
      if (!uniqueTags.has(key)) {
        uniqueTags.set(key, normalized);
      }
    }

    return [...uniqueTags.values()].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
  }

  function normalizeMetadataTags(tags: string[]) {
    const uniqueTags = new Map<string, string>();
    for (const tag of tags) {
      const normalized = tag.trim();
      if (!normalized) {
        continue;
      }

      const key = normalized.toLowerCase();
      if (!uniqueTags.has(key)) {
        uniqueTags.set(key, normalized);
      }
    }

    return [...uniqueTags.values()];
  }

  function computeTagPoolUsage(pool: string[], games: GameSummary[]) {
    return Object.fromEntries(
      normalizeTagPool(pool).map((tag) => {
        const normalizedTag = tag.toLowerCase();
        const usage = games.reduce((count, game) => {
          const gameHasTag = game.metadata.tags.some((entry) => entry.trim().toLowerCase() === normalizedTag);
          return gameHasTag ? count + 1 : count;
        }, 0);

        return [tag, usage];
      }),
    );
  }

  function tagExistsInAnyGame(tag: string) {
    const normalized = tag.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    return scanResult.games.some((game) =>
      game.metadata.tags.some((entry) => entry.trim().toLowerCase() === normalized),
    );
  }

  async function persistTagPool(
    nextPool: string[],
    successMessage?: string,
    baseConfig?: GalleryConfig | null,
    usageGames?: GameSummary[],
  ) {
    const configSnapshot = baseConfig ?? config;
    if (!configSnapshot) {
      return;
    }

    const normalizedPool = normalizeTagPool(nextPool);
    const normalizedUsage = usageGames
      ? computeTagPoolUsage(normalizedPool, usageGames)
      : Object.fromEntries(
          normalizedPool.map((tag) => [tag, configSnapshot.tagPoolUsage?.[tag] ?? 0]),
        );

    try {
      const savedConfig = await window.gallery.saveConfig({
        ...configSnapshot,
        tagPool: normalizedPool,
        tagPoolUsage: normalizedUsage,
      });
      setConfig(savedConfig);
      if (successMessage) {
        setStatus(successMessage);
      }
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to save tag pool.');
      setStatus(message);
      void logAppEvent(message, 'error', 'save-tag-pool');
    }
  }

  async function removeTagFromPoolByIndex(index: number) {
    if (!config) {
      return;
    }

    const candidate = config.tagPool[index] ?? '';
    if (tagExistsInAnyGame(candidate)) {
      setStatus(`Cannot remove "${candidate}" because it is used by one or more games.`);
      return;
    }

    await persistTagPool(config.tagPool.filter((_, tagIndex) => tagIndex !== index));
  }

  async function finalizeTagPoolEdit(index: number) {
    if (!config) {
      return;
    }

    const currentValue = (config.tagPool[index] ?? '').trim();
    if (!currentValue) {
      const original = tagPoolEditorOriginalValue.trim();
      if (original && tagExistsInAnyGame(original)) {
        const restoredPool = config.tagPool.map((entry, tagIndex) => (tagIndex === index ? original : entry));
        setConfig({ ...config, tagPool: restoredPool });
        setStatus(`Cannot remove "${original}" because it is used by one or more games.`);
        setActiveTagPoolEditorIndex(null);
        setActiveTagAutocomplete(null);
        return;
      }

      const nextPool = config.tagPool.filter((_, tagIndex) => tagIndex !== index);
      setConfig({ ...config, tagPool: nextPool });
      await persistTagPool(nextPool, undefined, config);
      setActiveTagPoolEditorIndex(null);
      setActiveTagAutocomplete(null);
      return;
    }

    const originalValue = tagPoolEditorOriginalValue.trim();
    const nextPool = config.tagPool.map((entry, tagIndex) => (tagIndex === index ? currentValue : entry));
    setConfig({ ...config, tagPool: nextPool });

    const isRename = Boolean(originalValue) && originalValue.toLowerCase() !== currentValue.toLowerCase();
    if (!isRename) {
      await persistTagPool(nextPool, undefined, config);
      setActiveTagPoolEditorIndex(null);
      setActiveTagAutocomplete(null);
      return;
    }

    try {
      const sourceKey = originalValue.toLowerCase();
      const targetTag = currentValue;
      const gamesToUpdate = scanResult.games.filter((game) =>
        game.metadata.tags.some((tag) => tag.trim().toLowerCase() === sourceKey),
      );

      await Promise.all(
        gamesToUpdate.map((game) => {
          const nextTags = normalizeMetadataTags(
            game.metadata.tags.map((tag) => (tag.trim().toLowerCase() === sourceKey ? targetTag : tag)),
          );

          return window.gallery.saveGameMetadata({
            gamePath: game.path,
            title: game.name,
            metadata: {
              ...game.metadata,
              tags: nextTags,
            },
          });
        }),
      );

      const updatedScan = await refreshScan();
      await persistTagPool(nextPool, undefined, config, updatedScan?.games ?? scanResult.games);
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to propagate tag rename to games.');
      setStatus(message);
      void logAppEvent(message, 'error', 'rename-tag-pool');
    }

    setActiveTagPoolEditorIndex(null);
    setActiveTagAutocomplete(null);
  }

  const knownTags = useMemo(() => {
    const uniqueTags = new Map<string, string>();

    for (const tag of config?.tagPool ?? []) {
      const normalized = tag.trim();
      if (!normalized) {
        continue;
      }

      const key = normalized.toLowerCase();
      if (!uniqueTags.has(key)) {
        uniqueTags.set(key, normalized);
      }
    }

    if (metadataDraft) {
      for (const tag of metadataDraft.tags) {
        const normalized = tag.trim();
        if (!normalized) {
          continue;
        }

        const key = normalized.toLowerCase();
        if (!uniqueTags.has(key)) {
          uniqueTags.set(key, normalized);
        }
      }
    }

    return [...uniqueTags.values()].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
  }, [config?.tagPool, metadataDraft]);

  const activeTagSuggestions = useMemo(() => {
    if (!activeTagAutocomplete) {
      return [] as string[];
    }

    const sourceValue = activeTagAutocomplete.scope === 'pool'
      ? config?.tagPool[activeTagAutocomplete.index] ?? ''
      : activeTagAutocomplete.scope === 'filter'
        ? draftTagRules[activeTagAutocomplete.index] ?? ''
        : metadataDraft?.tags[activeTagAutocomplete.index] ?? '';

    const withoutPrefix = sourceValue.trim().startsWith('-') ? sourceValue.trim().slice(1).trim() : sourceValue.trim();
    const query = withoutPrefix.toLowerCase();
    if (!query) {
      return knownTags.slice(0, 8);
    }

    return knownTags
      .filter((tag) => tag.toLowerCase().includes(query))
      .slice(0, 8);
  }, [activeTagAutocomplete, config?.tagPool, draftTagRules, metadataDraft, knownTags]);

  const topUsedFilterSuggestions = useMemo(() => {
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
        count: Number.isFinite(config.tagPoolUsage?.[tag]) ? config.tagPoolUsage[tag] : 0,
      }))
      .filter((entry) => !activeKeys.has(entry.tag.toLowerCase()))
      .sort((left, right) => {
        if (left.count !== right.count) {
          return right.count - left.count;
        }

        return left.tag.localeCompare(right.tag, undefined, { sensitivity: 'base' });
      })
      .slice(0, 10);
  }, [config, draftTagRules]);

  function applyTagSuggestion(scope: 'pool' | 'filter' | 'metadata', index: number, suggestion: string) {
    if (scope === 'pool') {
      if (!config) {
        return;
      }

      const nextPool = config.tagPool.map((entry, tagIndex) => (tagIndex === index ? suggestion : entry));
      setConfig({ ...config, tagPool: nextPool });
      void persistTagPool(nextPool);
    } else if (scope === 'filter') {
      setDraftTagRules((current) => {
        const existing = current[index] ?? '';
        const prefix = existing.trim().startsWith('-') ? '-' : '';
        return current.map((entry, ruleIndex) => (ruleIndex === index ? `${prefix}${suggestion}` : entry));
      });
    } else if (metadataDraft) {
      setMetadataDraft({
        ...metadataDraft,
        tags: metadataDraft.tags.map((entry, tagIndex) => (tagIndex === index ? suggestion : entry)),
      });
    }

    setActiveTagAutocomplete(null);
  }

  function handleTagAutocompleteKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
    scope: 'pool' | 'filter' | 'metadata',
    index: number,
  ) {
    const isActive = activeTagAutocomplete?.scope === scope && activeTagAutocomplete.index === index;
    if (!isActive || !activeTagSuggestions.length) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveTagAutocomplete((current) => {
        if (!current || current.scope !== scope || current.index !== index) {
          return current;
        }

        return {
          ...current,
          highlighted: (current.highlighted + 1) % activeTagSuggestions.length,
        };
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveTagAutocomplete((current) => {
        if (!current || current.scope !== scope || current.index !== index) {
          return current;
        }

        return {
          ...current,
          highlighted: (current.highlighted - 1 + activeTagSuggestions.length) % activeTagSuggestions.length,
        };
      });
      return;
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      const selected = activeTagSuggestions[activeTagAutocomplete.highlighted] ?? activeTagSuggestions[0];
      if (selected) {
        applyTagSuggestion(scope, index, selected);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setActiveTagAutocomplete(null);
    }
  }

  function resetStagedFilters() {
    setDraftTagRules([]);
    setActiveFilterRuleEditorIndex(null);
    setActiveTagAutocomplete(null);
    setDraftMinScore('');
    setDraftStatus('');
    setDraftOrderBy('alpha-asc');
  }

  function beginSavePreset() {
    setDraftPresetName('');
    setIsPresetNamingOpen(true);
  }

  async function saveCurrentFilterPreset() {
    if (!config || isPresetSaving) {
      return;
    }

    const name = draftPresetName.trim();
    if (!name) {
      setStatus('Preset name is required.');
      return;
    }

    const preset: FilterPreset = {
      name,
      tagRules: normalizeTagRules(draftTagRules),
      minScore: draftMinScore.trim(),
      status: draftStatus,
      orderBy: draftOrderBy,
    };

    const nextPresets = [
      ...config.filterPresets.filter((entry) => entry.name.toLowerCase() !== name.toLowerCase()),
      preset,
    ];

    setIsPresetSaving(true);
    try {
      const savedConfig = await window.gallery.saveConfig({
        ...config,
        filterPresets: nextPresets,
      });
      setConfig(savedConfig);
      setDraftPresetName('');
      setIsPresetNamingOpen(false);
      setStatus(`Filter preset saved as ${name}.`);
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to save filter preset.');
      setStatus(message);
      void logAppEvent(message, 'error', 'save-filter-preset');
    } finally {
      setIsPresetSaving(false);
    }
  }

  function loadFilterPresetToDraft(preset: FilterPreset) {
    setDraftTagRules([...preset.tagRules]);
    setDraftMinScore(preset.minScore);
    setDraftStatus(preset.status ?? '');
    setDraftOrderBy(preset.orderBy);
  }

  async function deleteFilterPreset(name: string) {
    if (!config) {
      return;
    }

    try {
      const savedConfig = await window.gallery.saveConfig({
        ...config,
        filterPresets: config.filterPresets.filter((entry) => entry.name !== name),
      });
      setConfig(savedConfig);
      setStatus(`Removed preset ${name}.`);
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to delete filter preset.');
      setStatus(message);
      void logAppEvent(message, 'error', 'delete-filter-preset');
    }
  }

  function applyFiltersAndOrdering() {
    const normalizedRules = normalizeTagRules(draftTagRules);
    setAppliedTagRules(normalizedRules);

    const parsedMinScore = Number.parseFloat(draftMinScore);
    setAppliedMinScore(Number.isFinite(parsedMinScore) ? parsedMinScore : null);

    setAppliedStatus(draftStatus.trim());
    setAppliedOrderBy(draftOrderBy);
  }

  function normalizedScore(value: string) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
  }

  const filteredGames = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const includeTags = appliedTagRules
      .filter((rule) => !rule.startsWith('-'))
      .map((rule) => rule.toLowerCase());
    const excludeTags = appliedTagRules
      .filter((rule) => rule.startsWith('-'))
      .map((rule) => rule.slice(1).trim().toLowerCase())
      .filter(Boolean);

    const filtered = scanResult.games.filter((game) => {
      if (query) {
        const matchesQuery = game.name.toLowerCase().includes(query)
          || game.versions.some((version) => version.name.toLowerCase().includes(query))
          || game.metadata.tags.some((tag) => tag.toLowerCase().includes(query));
        if (!matchesQuery) {
          return false;
        }
      }

      const gameTags = new Set(game.metadata.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean));

      if (includeTags.some((tag) => !gameTags.has(tag))) {
        return false;
      }

      if (excludeTags.some((tag) => gameTags.has(tag))) {
        return false;
      }

      if (appliedMinScore !== null && normalizedScore(game.metadata.score) < appliedMinScore) {
        return false;
      }

      if (appliedStatus && game.metadata.status.trim().toLowerCase() !== appliedStatus.trim().toLowerCase()) {
        return false;
      }

      return true;
    });

    const sorted = [...filtered];
    sorted.sort((left, right) => {
      if (appliedOrderBy === 'alpha-asc') {
        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
      }

      if (appliedOrderBy === 'alpha-desc') {
        return right.name.localeCompare(left.name, undefined, { sensitivity: 'base' });
      }

      const leftScore = normalizedScore(left.metadata.score);
      const rightScore = normalizedScore(right.metadata.score);
      if (leftScore !== rightScore) {
        return appliedOrderBy === 'score-asc' ? leftScore - rightScore : rightScore - leftScore;
      }

      return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
    });

    return sorted;
  }, [scanResult.games, searchQuery, appliedTagRules, appliedMinScore, appliedStatus, appliedOrderBy]);

  const selectedGame = useMemo(
    () => filteredGames.find((game) => game.path === selectedGamePath) ?? null,
    [filteredGames, selectedGamePath],
  );

  const detailGame = useMemo(
    () => scanResult.games.find((game) => game.path === detailGamePath) ?? null,
    [scanResult.games, detailGamePath],
  );

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

    return clamp(Math.pow(ratio, 0.5), 0.75, 1.25);
  }, [config?.uiDynamicGridScaling, viewMode, gridColumns]);

  const effectiveGlobalZoom = clamp(config?.uiGlobalZoom ?? 1, 0.75, 2);
  const effectiveFontScale = clamp((config?.uiBaseFontScale ?? 1) * dynamicUiScaleFactor * effectiveGlobalZoom, 0.6, 2.4);
  const effectiveSpacingScale = clamp((config?.uiBaseSpacingScale ?? 1) * dynamicUiScaleFactor * effectiveGlobalZoom, 0.6, 2.4);
  const metadataGapSetting = config?.uiMetadataGapScale ?? 1;
  const effectiveMetadataGapScale = clamp((metadataGapSetting * 0.5) * effectiveFontScale, 0.12, 3);
  const effectiveMediaScale = clamp((effectiveFontScale + effectiveSpacingScale) / 2, 0.7, 1.6);
  const contentScaleStyle = {
    ['--content-font-scale' as string]: effectiveFontScale.toFixed(3),
    ['--content-spacing-scale' as string]: effectiveSpacingScale.toFixed(3),
    ['--metadata-gap-scale' as string]: effectiveMetadataGapScale.toFixed(3),
    ['--content-media-scale' as string]: effectiveMediaScale.toFixed(3),
  } as CSSProperties;

  useEffect(() => {
    const updateGlobalZoom = (nextZoom: number) => {
      setConfig((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          uiGlobalZoom: clamp(nextZoom, 0.75, 2),
        };
      });
    };

    const adjustGlobalZoom = (delta: number) => {
      setConfig((current) => {
        if (!current) {
          return current;
        }

        const currentZoom = Number.isFinite(current.uiGlobalZoom) ? current.uiGlobalZoom : 1;
        const nextZoom = Math.round((currentZoom + delta) * 100) / 100;
        return {
          ...current,
          uiGlobalZoom: clamp(nextZoom, 0.75, 2),
        };
      });
    };

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) {
        return;
      }

      event.preventDefault();
      adjustGlobalZoom(event.deltaY < 0 ? 0.05 : -0.05);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      const normalizedKey = key.toLowerCase();
      const ctrlOrMetaPressed = event.ctrlKey || event.metaKey;
      const canUsePlainPlusMinus = !event.altKey && !ctrlOrMetaPressed && !isTypingTarget(event.target);

      if (ctrlOrMetaPressed && normalizedKey === '0') {
        event.preventDefault();
        updateGlobalZoom(1);
        return;
      }

      const isZoomInKey = key === '+' || key === '=' || normalizedKey === 'numpadadd';
      const isZoomOutKey = key === '-' || key === '_' || normalizedKey === 'numpadsubtract';

      if ((ctrlOrMetaPressed || canUsePlainPlusMinus) && isZoomInKey) {
        event.preventDefault();
        adjustGlobalZoom(0.05);
        return;
      }

      if ((ctrlOrMetaPressed || canUsePlainPlusMinus) && isZoomOutKey) {
        event.preventDefault();
        adjustGlobalZoom(-0.05);
      }
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (viewMode !== 'poster' && viewMode !== 'card') {
      return;
    }

    const container = cardsContainerRef.current;
    if (!container) {
      return;
    }

    const minCardWidth = gridMinCardWidthPx[viewMode] * clamp(effectiveMediaScale, 0.7, 1.6);
    const updateColumns = () => {
      const width = container.clientWidth;
      const maxFitColumns = Math.max(1, Math.floor((width + gridGapPx) / (minCardWidth + gridGapPx)));
      const configuredColumns = viewMode === 'poster' ? config?.posterColumns : config?.cardColumns;
      const preferredColumns = configuredColumns && configuredColumns > 0 ? configuredColumns : maxFitColumns;
      const nextColumns = Math.max(1, Math.min(preferredColumns, maxFitColumns));
      setGridColumns(nextColumns);
    };

    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [viewMode, filteredGames.length, detailGamePath, config?.posterColumns, config?.cardColumns, effectiveMediaScale]);

  useEffect(() => {
    const dispose = window.gallery.onGameContextMenuAction((payload) => {
      if (payload.action === 'open') {
        openGameDetailFromPath(payload.gamePath);
        return;
      }

      if (payload.action === 'open-game-folder') {
        void openFolderInExplorer(payload.gamePath);
        return;
      }

      if (payload.action === 'edit-metadata') {
        openMetadataModal(payload.gamePath);
        return;
      }

      if (payload.action === 'manage-pictures') {
        openPicturesModal(payload.gamePath);
        return;
      }

      const game = scanResult.games.find((candidate) => candidate.path === payload.gamePath);
      if (game) {
        void playGame(game);
        return;
      }

      setStatus('Unable to find selected game in current list.');
    });

    return () => {
      dispose();
    };
  }, [scanResult.games]);

  useEffect(() => {
    const dispose = window.gallery.onVersionContextMenuAction((payload) => {
      if (payload.action === 'open-version-folder') {
        void openFolderInExplorer(payload.versionPath);
      }
    });

    return () => {
      dispose();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isFindShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f';
      if (!isFindShortcut) {
        return;
      }

      event.preventDefault();
      const input = searchInputRef.current;
      if (!input) {
        return;
      }

      input.focus();
      input.select();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'F5') {
        return;
      }

      event.preventDefault();
      if (isScanning) {
        return;
      }

      void refreshScan();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isScanning]);

  useEffect(() => {
    if (!screenshotModalPath) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setScreenshotModalPath(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [screenshotModalPath]);

  if (!config) {
    return <main className="shell"><section className="panel panel--loading">{status}</section></main>;
  }

  function renderFocusCard(game: GameSummary, isVertical: boolean, showActions = true) {
    const hasScreenshotCarousel = game.media.screenshots.length > 0;
    const carouselIndex = hasScreenshotCarousel
      ? focusCarouselIndexByGamePath[game.path] ?? 0
      : 0;
    const normalizedCarouselIndex = hasScreenshotCarousel
      ? ((carouselIndex % game.media.screenshots.length) + game.media.screenshots.length) % game.media.screenshots.length
      : 0;
    const focusImgSrc = hasScreenshotCarousel
      ? filePathToSrc(game.media.screenshots[normalizedCarouselIndex] ?? null)
      : isVertical
        ? filePathToSrc(game.media.poster ?? game.media.card)
        : filePathToSrc(game.media.card ?? game.media.poster);
    const currentCarouselImagePath = hasScreenshotCarousel
      ? game.media.screenshots[normalizedCarouselIndex] ?? null
      : null;

    const moveFocusCarousel = (delta: number) => {
      if (!hasScreenshotCarousel) {
        return;
      }

      setFocusCarouselIndexByGamePath((current) => {
        const currentIndex = current[game.path] ?? 0;
        return {
          ...current,
          [game.path]: currentIndex + delta,
        };
      });
    };

    return (
      <article className={`focus-card panel ${isVertical ? 'focus-card--vertical' : 'focus-card--wide'}`}>
        <div className={`game-card__art ${game.usesPlaceholderArt ? 'game-card__art--placeholder' : ''}`}>
          {hasScreenshotCarousel && focusImgSrc && currentCarouselImagePath ? (
            <button
              type="button"
              className="focus-carousel-image-button"
              onClick={(event) => {
                event.stopPropagation();
                setScreenshotModalPath(currentCarouselImagePath);
              }}
            >
              <img src={focusImgSrc} alt={game.name} className="media-preview media-preview--cover" />
            </button>
          ) : focusImgSrc ? (
            <img src={focusImgSrc} alt={game.name} className="media-preview media-preview--cover" />
          ) : null}
          {hasScreenshotCarousel && game.media.screenshots.length > 1 ? (
            <div className="focus-carousel-controls">
              <button
                className="button button--icon"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  moveFocusCarousel(-1);
                }}
                aria-label="Previous screenshot"
              >
                Prev
              </button>
              <span>{normalizedCarouselIndex + 1}/{game.media.screenshots.length}</span>
              <button
                className="button button--icon"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  moveFocusCarousel(1);
                }}
                aria-label="Next screenshot"
              >
                Next
              </button>
            </div>
          ) : null}
          <span>{game.usesPlaceholderArt ? 'Using placeholder art' : `${game.imageCount} images`}</span>
        </div>
        <div className="focus-card__content">
          <h3>{game.name}</h3>
          <p>Latest version: {game.metadata.latestVersion || 'Unknown'}</p>
          <p>Status: {game.metadata.status || 'Not set'}</p>
          <p>Score: {game.metadata.score || 'Not set'}</p>
          <p>Last date played: {formatLastPlayed(game.lastPlayedAt)}</p>
          <p>{game.metadata.description || 'No description yet.'}</p>
          {game.metadata.notes.filter(Boolean).slice(0, 2).map((note) => (
            <p key={note}>Note: {note}</p>
          ))}
          {game.metadata.tags.length ? <p>Tags: {game.metadata.tags.join(', ')}</p> : null}
          {showActions ? (
            <div className="game-card__actions game-card__actions--floating">
              <button
                className="button button--play button--icon button--icon-only"
                type="button"
                onClick={(event) => handlePlayClick(game, event)}
                aria-label={actionLabels.play}
                title={actionLabels.play}
              >
                <Play size={16} aria-hidden="true" />
              </button>
              <button
                className="button button--icon button--icon-only"
                type="button"
                onClick={(event) => handleOpenDetail(game, event)}
                aria-label={actionLabels.open}
                title={actionLabels.open}
              >
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
      </article>
    );
  }

  function renderGame(game: GameSummary) {
    const artImgSrc = filePathToSrc(viewMode === 'poster' ? game.media.poster : game.media.card);
    const art = (
      <div className={`game-card__art ${game.usesPlaceholderArt ? 'game-card__art--placeholder' : ''}`}>
        {artImgSrc ? (
          <img src={artImgSrc} alt={game.name} className="media-preview media-preview--cover" />
        ) : null}
        <span>{game.usesPlaceholderArt ? 'Using placeholder art' : `${game.imageCount} images`}</span>
      </div>
    );

    const bootstrapText = `${game.createdPicturesFolder ? 'pictures folder ' : ''}${game.createdGameNfo ? 'game.nfo ' : ''}${
      game.createdVersionNfoCount > 0 ? `${game.createdVersionNfoCount} version nfo files` : ''
    }`.trim();

    const commonActions = (
      <div className="game-card__actions">
        <button
          className="button button--play button--icon button--icon-only"
          type="button"
          onClick={(event) => handlePlayClick(game, event)}
          aria-label={actionLabels.play}
          title={actionLabels.play}
        >
          <Play size={16} aria-hidden="true" />
        </button>
        <button
          className="button button--icon button--icon-only"
          type="button"
          onClick={(event) => handleOpenDetail(game, event)}
          aria-label={actionLabels.open}
          title={actionLabels.open}
        >
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    );

    const onGameContextMenu = (event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault();
      void window.gallery.showGameContextMenu({
        gamePath: game.path,
        gameName: game.name,
      });
    };

    if (viewMode === 'compact') {
      const compactDescription = game.metadata.description.trim();
      const compactTags = game.metadata.tags.map((tag) => tag.trim()).filter(Boolean);
      return (
        <article
          className={`game-card game-card--compact ${selectedGamePath === game.path ? 'game-card--selected' : ''}`}
          key={game.path}
          onClick={() => toggleGameSelection(game.path)}
          onContextMenu={onGameContextMenu}
        >
          <div className="game-card__row">
            <h3>{game.name}</h3>
          </div>
          <div className="game-card__compact-main">
            <div className="game-card__compact-meta">
              <p><strong>Status:</strong> {game.metadata.status || 'Not set'}</p>
              <p><strong>Score:</strong> {game.metadata.score || 'Not set'}</p>
              <p className="game-card__compact-description"><strong>Description:</strong> {compactDescription || 'No description yet.'}</p>
              <p><strong>Tags:</strong> {compactTags.length ? compactTags.join(', ') : 'None'}</p>
            </div>
            <div className="game-card__actions game-card__actions--stacked">
              <button
                className="button button--play button--icon button--icon-only"
                type="button"
                onClick={(event) => handlePlayClick(game, event)}
                aria-label={actionLabels.play}
                title={actionLabels.play}
              >
                <Play size={16} aria-hidden="true" />
              </button>
              <button
                className="button button--icon button--icon-only"
                type="button"
                onClick={(event) => handleOpenDetail(game, event)}
                aria-label={actionLabels.open}
                title={actionLabels.open}
              >
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </article>
      );
    }

    if (viewMode === 'card') {
      return (
        <article
          className={`game-card game-card--card ${selectedGamePath === game.path ? 'game-card--selected' : ''}`}
          key={game.path}
          onClick={() => toggleGameSelection(game.path)}
          onContextMenu={onGameContextMenu}
        >
          {art}
          <div className="game-card__body">
            <h3>{game.name}</h3>
            <p>Latest version: {game.metadata.latestVersion || 'Unknown'}</p>
            <p>Status: {game.metadata.status || 'Not set'}</p>
            <p>Score: {game.metadata.score || 'Not set'}</p>
            <p>Tags: {game.metadata.tags.length ? game.metadata.tags.join(', ') : 'None'}</p>
            {commonActions}
          </div>
        </article>
      );
    }

    if (viewMode === 'expanded') {
      return (
        <article
          className={`game-card game-card--expanded ${selectedGamePath === game.path ? 'game-card--selected' : ''}`}
          key={game.path}
          onClick={() => toggleGameSelection(game.path)}
          onContextMenu={onGameContextMenu}
        >
          {art}
          <div className="game-card__body game-card__body--expanded">
            <div>
              <h3>{game.name}</h3>
              <p>Status: {game.metadata.status || 'Not set'}</p>
              <p>Score: {game.metadata.score || 'Not set'}</p>
              <p>Tags: {game.metadata.tags.length ? game.metadata.tags.join(', ') : 'None'}</p>
              <p>{game.metadata.description || 'No description yet.'}</p>
              {game.metadata.notes.filter(Boolean).slice(0, 2).map((note) => (
                <p key={note}>Note: {note}</p>
              ))}
              {bootstrapText ? <p>Bootstrapped: {bootstrapText}</p> : null}
              <ul className="version-list">
                {game.versions.map((version) => (
                  <li key={version.path}>
                    <span>{version.name}</span>
                    <span>{version.hasNfo ? 'nfo' : 'no nfo'}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="game-card__actions game-card__actions--stacked">
              <button
                className="button button--play button--icon button--icon-only"
                type="button"
                onClick={(event) => handlePlayClick(game, event)}
                aria-label={actionLabels.play}
                title={actionLabels.play}
              >
                <Play size={16} aria-hidden="true" />
              </button>
              <button
                className="button button--icon button--icon-only"
                type="button"
                onClick={(event) => handleOpenDetail(game, event)}
                aria-label={actionLabels.open}
                title={actionLabels.open}
              >
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </article>
      );
    }

    return (
      <article
        className={`game-card game-card--poster ${selectedGamePath === game.path ? 'game-card--selected' : ''}`}
        key={game.path}
        onClick={() => toggleGameSelection(game.path)}
        onContextMenu={onGameContextMenu}
      >
        {art}
        <div className="game-card__body">
          <h3>{game.name}</h3>
          <p>Status: {game.metadata.status || 'Not set'}</p>
          <p>Score: {game.metadata.score || 'Not set'}</p>
          {commonActions}
        </div>
      </article>
    );
  }

  function renderInlinePosterCardFocus() {
    const rows: GameSummary[][] = [];
    for (let index = 0; index < filteredGames.length; index += gridColumns) {
      rows.push(filteredGames.slice(index, index + gridColumns));
    }

    return rows.map((row, rowIndex) => {
      const selectedGameInRow = row.find((game) => game.path === selectedGamePath) ?? null;

      return (
        <Fragment key={`row-${rowIndex}`}>
          {row.map((game) => renderGame(game))}
          {selectedGameInRow ? <div className="focus-inline focus-inline--enter">{renderFocusCard(selectedGameInRow, false)}</div> : null}
        </Fragment>
      );
    });
  }

  const detailBackgroundSrc = detailGame ? filePathToSrc(detailGame.media.background) : null;

  return (
    <main className="shell">
      <header className="topbar panel">
        <div className="topbar__title">
          <p className="eyebrow">Local Game Gallery</p>
          <p>Games found: {scanResult.games.length}</p>
        </div>
        <div className="topbar__actions">
          <div className="topbar__search-group">
            <label className="topbar__search" aria-label="Search games">
              <input
                ref={searchInputRef}
                type="search"
                placeholder="Search games or versions"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>
          </div>
          <button
            className={`button button--icon-only ${isTagPoolPanelOpen ? 'is-active' : ''}`}
            type="button"
            onClick={() => setIsTagPoolPanelOpen((current) => !current)}
            aria-pressed={isTagPoolPanelOpen}
            aria-label={isTagPoolPanelOpen ? actionLabels.hideTagPool : actionLabels.showTagPool}
            title={isTagPoolPanelOpen ? actionLabels.hideTagPool : actionLabels.showTagPool}
          >
            <Tag size={16} aria-hidden="true" />
          </button>
          <button
            className={`button button--primary button--icon-only ${isFilterPanelOpen ? 'is-active' : ''}`}
            type="button"
            onClick={() => setIsFilterPanelOpen((current) => !current)}
            aria-pressed={isFilterPanelOpen}
            aria-label={isFilterPanelOpen ? actionLabels.hideFilters : actionLabels.showFilters}
            title={isFilterPanelOpen ? actionLabels.hideFilters : actionLabels.showFilters}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
          </button>
          <button
            className={`button button--icon-only ${isSidebarOpen ? 'is-active' : ''}`}
            type="button"
            onClick={() => setIsSidebarOpen((current) => !current)}
            aria-pressed={isSidebarOpen}
            aria-label={isSidebarOpen ? actionLabels.hideSetup : actionLabels.showSetup}
            title={isSidebarOpen ? actionLabels.hideSetup : actionLabels.showSetup}
          >
            <Settings size={16} aria-hidden="true" />
          </button>
          <button
            className={`button button--icon-only ${isScanning ? 'is-busy' : ''}`}
            type="button"
            onClick={() => void refreshScan()}
            disabled={isScanning}
            aria-label={isScanning ? actionLabels.scanning : actionLabels.rescan}
            title={isScanning ? actionLabels.scanning : actionLabels.rescan}
          >
            <RefreshCw size={16} aria-hidden="true" className={isScanning ? 'icon-spin' : undefined} />
          </button>
        </div>
        {isTagPoolPanelOpen ? (
          <section className="topbar-filters topbar-tag-pool">
            <div className="topbar-filters__heading">
              <strong>Tag pool</strong>
            </div>
            <p className="topbar-filters__hint">Click a bubble to edit. Right-click to remove only when unused by all games.</p>
            <div className="tag-bubbles">
              {config.tagPool.map((tag, index) => {
                const isEditing = activeTagPoolEditorIndex === index;
                const bubbleLabel = tag.trim() || 'Empty tag';
                const usageCount = Number.isFinite(config.tagPoolUsage?.[tag]) ? config.tagPoolUsage[tag] : 0;

                if (isEditing) {
                  return (
                    <div className="tag-bubble tag-bubble--editing" key={`pool-tag-${index}`}>
                      <div className="tag-autocomplete">
                        <input
                          type="text"
                          autoFocus
                          value={tag}
                          placeholder="example: roguelike"
                          onFocus={() => setActiveTagAutocomplete({ scope: 'pool', index, highlighted: 0 })}
                          onBlur={() => {
                            window.setTimeout(() => {
                              void finalizeTagPoolEdit(index);
                            }, 100);
                          }}
                          onKeyDown={(event) => {
                            handleTagAutocompleteKeyDown(event, 'pool', index);
                            if (event.key === 'Enter' || event.key === 'Escape') {
                              event.preventDefault();
                              void finalizeTagPoolEdit(index);
                            }
                          }}
                          onChange={(event) => {
                            setConfig((current) => {
                              if (!current) {
                                return current;
                              }

                              return {
                                ...current,
                                tagPool: current.tagPool.map((entry, tagIndex) => (tagIndex === index ? event.target.value : entry)),
                              };
                            });
                            setActiveTagAutocomplete({ scope: 'pool', index, highlighted: 0 });
                          }}
                        />
                        {activeTagAutocomplete?.scope === 'pool' && activeTagAutocomplete.index === index && activeTagSuggestions.length ? (
                          <div className="tag-autocomplete__menu">
                            {activeTagSuggestions.map((suggestion, suggestionIndex) => (
                              <button
                                key={`${suggestion}-${suggestionIndex}`}
                                className={`tag-autocomplete__item ${activeTagAutocomplete.highlighted === suggestionIndex ? 'tag-autocomplete__item--active' : ''}`}
                                type="button"
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  applyTagSuggestion('pool', index, suggestion);
                                }}
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                }

                return (
                  <button
                    key={`pool-tag-${index}`}
                    className="tag-bubble tag-bubble--suggested"
                    type="button"
                    title={`${bubbleLabel} (${usageCount} game${usageCount === 1 ? '' : 's'})`}
                    onClick={() => {
                      setTagPoolEditorOriginalValue(config.tagPool[index] ?? '');
                      setActiveTagPoolEditorIndex(index);
                      setActiveTagAutocomplete({ scope: 'pool', index, highlighted: 0 });
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      void removeTagFromPoolByIndex(index);
                      setActiveTagPoolEditorIndex(null);
                      setActiveTagAutocomplete(null);
                    }}
                  >
                    <span>{bubbleLabel}</span>
                    <span className="tag-bubble__metric">{usageCount}</span>
                  </button>
                );
              })}
              <button
                className="tag-bubble tag-bubble--add"
                type="button"
                onClick={() => {
                  const nextIndex = config.tagPool.length;
                  const nextPool = [...config.tagPool, ''];
                  setConfig({ ...config, tagPool: nextPool });
                  setTagPoolEditorOriginalValue('');
                  setActiveTagPoolEditorIndex(nextIndex);
                  setActiveTagAutocomplete({ scope: 'pool', index: nextIndex, highlighted: 0 });
                }}
                title="Add pool tag"
              >
                +
              </button>
            </div>
          </section>
        ) : null}
        {isFilterPanelOpen ? (
          <section className="topbar-filters">
            <div className="topbar-filters__grid">
              <div className="topbar-filters__group">
                <div className="topbar-filters__heading">
                  <strong>Tag rules</strong>
                </div>
                <p className="topbar-filters__hint">Click a bubble to edit. Right-click a bubble to remove. Prefix with - to exclude.</p>
                <div className="tag-bubbles">
                  {draftTagRules.map((rule, index) => {
                    const isEditing = activeFilterRuleEditorIndex === index;
                    const normalizedRule = rule.trim();
                    const isExclude = normalizedRule.startsWith('-');
                    const bubbleLabel = normalizedRule || 'Empty tag';

                    if (isEditing) {
                      return (
                        <div className="tag-bubble tag-bubble--editing" key={`filter-rule-${index}`}>
                          <div className="tag-autocomplete">
                            <input
                              type="text"
                              autoFocus
                              value={rule}
                              placeholder="example: roguelike or -horror"
                              onFocus={() => setActiveTagAutocomplete({ scope: 'filter', index, highlighted: 0 })}
                              onBlur={() => {
                                window.setTimeout(() => {
                                  setDraftTagRules((current) => {
                                    const nextValue = (current[index] ?? '').trim();
                                    if (nextValue) {
                                      return current;
                                    }

                                    return current.filter((_, ruleIndex) => ruleIndex !== index);
                                  });
                                  setActiveFilterRuleEditorIndex((current) => (current === index ? null : current));
                                  setActiveTagAutocomplete((current) => {
                                    if (!current || current.scope !== 'filter' || current.index !== index) {
                                      return current;
                                    }

                                    return null;
                                  });
                                }, 100);
                              }}
                              onKeyDown={(event) => {
                                handleTagAutocompleteKeyDown(event, 'filter', index);
                                if (event.key === 'Enter' || event.key === 'Escape') {
                                  setActiveFilterRuleEditorIndex(null);
                                  setActiveTagAutocomplete(null);
                                }
                              }}
                              onChange={(event) => {
                                setDraftTagRules((current) => current.map((entry, ruleIndex) => (ruleIndex === index ? event.target.value : entry)));
                                setActiveTagAutocomplete({ scope: 'filter', index, highlighted: 0 });
                              }}
                            />
                            {activeTagAutocomplete?.scope === 'filter' && activeTagAutocomplete.index === index && activeTagSuggestions.length ? (
                              <div className="tag-autocomplete__menu">
                                {activeTagSuggestions.map((suggestion, suggestionIndex) => (
                                  <button
                                    key={`${suggestion}-${suggestionIndex}`}
                                    className={`tag-autocomplete__item ${activeTagAutocomplete.highlighted === suggestionIndex ? 'tag-autocomplete__item--active' : ''}`}
                                    type="button"
                                    onMouseDown={(event) => {
                                      event.preventDefault();
                                      applyTagSuggestion('filter', index, suggestion);
                                    }}
                                  >
                                    {suggestion}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={`filter-rule-${index}`}
                        className={`tag-bubble ${isExclude ? 'tag-bubble--exclude' : ''}`}
                        type="button"
                        title={bubbleLabel}
                        onClick={() => {
                          setActiveFilterRuleEditorIndex(index);
                          setActiveTagAutocomplete({ scope: 'filter', index, highlighted: 0 });
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setDraftTagRules((current) => current.filter((_, ruleIndex) => ruleIndex !== index));
                          setActiveFilterRuleEditorIndex(null);
                          setActiveTagAutocomplete(null);
                        }}
                      >
                        {bubbleLabel}
                      </button>
                    );
                  })}
                  <button
                    className="tag-bubble tag-bubble--add"
                    type="button"
                    onClick={() => {
                      const nextIndex = draftTagRules.length;
                      setDraftTagRules((current) => [...current, '']);
                      setActiveFilterRuleEditorIndex(nextIndex);
                      setActiveTagAutocomplete({ scope: 'filter', index: nextIndex, highlighted: 0 });
                    }}
                    title="Add tag rule"
                  >
                    +
                  </button>
                </div>
                <div className="topbar-filters__suggestions">
                  <p className="topbar-filters__hint">Top used tags right now. Click to add as a filter.</p>
                  <div className="tag-bubbles">
                    {topUsedFilterSuggestions.map((entry) => (
                      <button
                        key={`suggestion-${entry.tag}`}
                        className="tag-bubble tag-bubble--suggested"
                        type="button"
                        onClick={() => {
                          setDraftTagRules((current) => [...current, entry.tag]);
                          setActiveFilterRuleEditorIndex(null);
                          setActiveTagAutocomplete(null);
                        }}
                        title={`Used in ${entry.count} game${entry.count === 1 ? '' : 's'}`}
                      >
                        <span>{entry.tag}</span>
                        <span className="tag-bubble__metric">{entry.count}</span>
                      </button>
                    ))}
                    {!topUsedFilterSuggestions.length ? (
                      <p className="topbar-filters__hint topbar-filters__hint--inline">No available suggestions.</p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="topbar-filters__group">
                <div className="topbar-filters__quick">
                <label className="field topbar-filters__field">
                  <span>Minimum score</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={draftMinScore}
                    onChange={(event) => setDraftMinScore(event.target.value)}
                    placeholder="Leave empty to ignore"
                  />
                </label>

                <label className="field topbar-filters__field">
                  <span>Order by</span>
                  <CustomSelect
                    className="custom-select--order"
                    ariaLabel="Order by"
                    value={draftOrderBy}
                    options={(Object.keys(orderByModeLabels) as FilterOrderByMode[]).map((mode) => ({
                      value: mode,
                      label: orderByModeLabels[mode],
                    }))}
                    onChange={(nextValue) => setDraftOrderBy(nextValue as FilterOrderByMode)}
                  />
                </label>

                <label className="field topbar-filters__field topbar-filters__field--full">
                  <span>Status</span>
                  <CustomSelect
                    ariaLabel="Filter status"
                    value={draftStatus}
                    options={[
                      { value: '', label: 'Any status' },
                      ...config.statusChoices.map((statusOption) => ({ value: statusOption, label: statusOption })),
                    ]}
                    onChange={setDraftStatus}
                  />
                </label>
                </div>

              </div>

              <div className="topbar-filters__group topbar-filters__group--presets">
                <section className="topbar-presets">
                  <div className="topbar-filters__heading">
                    <strong>Presets</strong>
                    {!isPresetNamingOpen ? (
                      <button className="button button--icon" type="button" onClick={beginSavePreset}>
                        Save preset
                      </button>
                    ) : null}
                  </div>
                  {isPresetNamingOpen ? (
                    <div className="topbar-presets__create">
                      <input
                        type="text"
                        value={draftPresetName}
                        autoFocus
                        placeholder="Preset name"
                        onChange={(event) => setDraftPresetName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void saveCurrentFilterPreset();
                          }
                        }}
                      />
                      <div className="topbar-presets__create-actions">
                        <button className="button button--icon" type="button" disabled={isPresetSaving} onClick={() => void saveCurrentFilterPreset()}>
                          {isPresetSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          className="button button--icon"
                          type="button"
                          onClick={() => {
                            setIsPresetNamingOpen(false);
                            setDraftPresetName('');
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {config.filterPresets.length ? (
                    <div className="topbar-presets__list">
                      {config.filterPresets.map((preset) => (
                        <div className="topbar-presets__item" key={preset.name}>
                          <p>{preset.name}</p>
                          <div className="topbar-presets__item-actions">
                            <button className="button button--icon" type="button" onClick={() => loadFilterPresetToDraft(preset)}>
                              Load
                            </button>
                            <button className="button button--icon" type="button" onClick={() => void deleteFilterPreset(preset.name)}>
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="topbar-filters__hint">No saved presets yet.</p>
                  )}
                </section>
              </div>
            </div>

            <div className="topbar-filters__actions">
              <button className="button" type="button" onClick={resetStagedFilters}>
                Reset staged
              </button>
              <button className="button button--primary" type="button" onClick={applyFiltersAndOrdering}>
                Apply
              </button>
            </div>
          </section>
        ) : null}
      </header>

      <section className={`layout ${detailGame ? 'layout--detail' : ''}`}>
        <aside className={`panel settings ${isSidebarOpen ? 'settings--open' : 'settings--closed'}`}>
          <form onSubmit={saveConfig}>
            <div className="panel-heading">
              <h2>Setup</h2>
              <p>Configuration is saved between app launches.</p>
            </div>

            <label className="field">
              <span>Games root</span>
              <div className="field__input-with-action">
                <input
                  type="text"
                  value={config.gamesRoot}
                  onChange={(event) => setConfig({ ...config, gamesRoot: event.target.value })}
                  placeholder="D:\\Games or /home/you/Games"
                />
                <button
                  className="button button--icon-only field__picker-button"
                  type="button"
                  onClick={pickRoot}
                  disabled={isSaving}
                  aria-label={actionLabels.chooseLibraryFolder}
                  title={actionLabels.chooseLibraryFolder}
                >
                  <FolderOpen size={16} aria-hidden="true" />
                </button>
              </div>
            </label>

            <label className="field">
              <span>Exclude patterns</span>
              <textarea
                rows={4}
                value={config.excludePatterns.join('\n')}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    excludePatterns: event.target.value.split('\n').map((value) => value.trim()),
                  })
                }
                placeholder=".git&#10;Thumbs.db"
              />
            </label>

            <label className="field field--toggle">
              <span>Hide dot-prefixed files and folders</span>
              <input
                type="checkbox"
                checked={config.hideDotEntries}
                onChange={(event) => setConfig({ ...config, hideDotEntries: event.target.checked })}
              />
            </label>

            <label className="field">
              <span>Version folder pattern</span>
              <input
                type="text"
                value={config.versionFolderPattern}
                onChange={(event) => setConfig({ ...config, versionFolderPattern: event.target.value })}
              />
            </label>

            <label className="field">
              <span>Pictures folder name</span>
              <input
                type="text"
                value={config.picturesFolderName}
                onChange={(event) => setConfig({ ...config, picturesFolderName: event.target.value })}
              />
            </label>

            <label className="field">
              <span>Status choices</span>
              <textarea
                rows={5}
                value={config.statusChoices.join('\n')}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    statusChoices: event.target.value.split('\n').map((value) => value.trim()),
                  })
                }
                placeholder="Backlog&#10;Playing&#10;Completed"
              />
            </label>

            <label className="field">
              <span>Poster view columns</span>
              <input
                type="number"
                min={0}
                max={12}
                value={config.posterColumns}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    posterColumns: Math.max(0, Number.parseInt(event.target.value || '0', 10) || 0),
                  })
                }
              />
              <small className="field__hint">Use 0 to auto-fit columns based on current element size.</small>
            </label>

            <label className="field">
              <span>Card view columns</span>
              <input
                type="number"
                min={0}
                max={12}
                value={config.cardColumns}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    cardColumns: Math.max(0, Number.parseInt(event.target.value || '0', 10) || 0),
                  })
                }
              />
              <small className="field__hint">Use 0 to auto-fit columns based on current element size.</small>
            </label>

            <label className="field">
              <span>Base font scale</span>
              <input
                type="number"
                min={0.75}
                max={1.5}
                step={0.05}
                value={config.uiBaseFontScale ?? 1}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    uiBaseFontScale: clamp(Number.parseFloat(event.target.value || '1') || 1, 0.75, 1.5),
                  })
                }
              />
              <small className="field__hint">Affects only game content cards/lists/detail, not setup or top menus.</small>
            </label>

            <label className="field">
              <span>Base spacing scale</span>
              <input
                type="number"
                min={0.75}
                max={1.5}
                step={0.05}
                value={config.uiBaseSpacingScale ?? 1}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    uiBaseSpacingScale: clamp(Number.parseFloat(event.target.value || '1') || 1, 0.75, 1.5),
                  })
                }
              />
              <small className="field__hint">Affects only game content spacing.</small>
            </label>

            <label className="field">
              <span>Metadata line spacing scale</span>
              <input
                type="number"
                min={0.5}
                max={4}
                step={0.05}
                value={config.uiMetadataGapScale ?? 1}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    uiMetadataGapScale: clamp(Number.parseFloat(event.target.value || '1') || 1, 0.5, 4),
                  })
                }
              />
              <small className="field__hint">Controls spacing between metadata lines in poster/card/expanded views and scales with font size.</small>
            </label>

            <label className="field field--toggle">
              <span>Dynamic scaling from grid density</span>
              <input
                type="checkbox"
                checked={Boolean(config.uiDynamicGridScaling)}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    uiDynamicGridScaling: event.target.checked,
                  })
                }
              />
            </label>

            <label className="field field--toggle">
              <span>Show system menu bar</span>
              <input
                type="checkbox"
                checked={Boolean(config.showSystemMenuBar)}
                onChange={(event) => {
                  const nextVisible = event.target.checked;
                  setConfig({
                    ...config,
                    showSystemMenuBar: nextVisible,
                  });
                  void window.gallery.setMenuBarVisibility(nextVisible);
                  void logAppEvent(`System menu bar ${nextVisible ? 'shown' : 'hidden'} from setup toggle.`, 'info', 'menu-bar');
                }}
              />
            </label>

            <label className="field">
              <span>Global zoom</span>
              <input
                type="number"
                min={0.75}
                max={2}
                step={0.05}
                value={config.uiGlobalZoom ?? 1}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    uiGlobalZoom: clamp(Number.parseFloat(event.target.value || '1') || 1, 0.75, 2),
                  })
                }
              />
              <small className="field__hint">Also works with Ctrl + mouse wheel and +/- keys. Ctrl+0 resets to 100%.</small>
            </label>

            <div className="setup-log-actions">
              <button className="button button--icon" type="button" onClick={() => void openLogViewer()}>
                View logs
              </button>
              <button className="button button--icon" type="button" onClick={() => void openLogFolderFromSetup()}>
                Open logs folder
              </button>
            </div>

            <button className="button button--primary" type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save setup'}
            </button>
          </form>
        </aside>

        <section
          className={`panel library ${detailGame ? 'library--detail' : ''} ${detailBackgroundSrc ? 'library--detail-bg' : ''}`}
          style={detailBackgroundSrc ? ({ ['--detail-bg-image' as string]: `url("${detailBackgroundSrc}")` } as CSSProperties) : undefined}
        >
          {detailGame ? (
            <section className="detail-page" style={contentScaleStyle}>
              <header className="detail-page__header">
                <button
                  className="button button--icon-only"
                  type="button"
                  onClick={() => setDetailGamePath(null)}
                  aria-label={actionLabels.back}
                  title={actionLabels.back}
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                </button>
                <h2>{detailGame.name}</h2>
                <button
                  className="button button--play button--icon-only"
                  type="button"
                  onClick={(event) => handlePlayClick(detailGame, event)}
                  aria-label={actionLabels.play}
                  title={actionLabels.play}
                >
                  <Play size={16} aria-hidden="true" />
                </button>
              </header>
              {renderFocusCard(detailGame, true, false)}
              <section className="detail-section panel">
                <div className="detail-section__header">
                  <h3>All metadata</h3>
                  <button className="button button--icon" type="button" onClick={() => openMetadataModal(detailGame.path)}>
                    Edit metadata
                  </button>
                </div>
                <div className="detail-metadata-grid">
                  <div>
                    <p>Latest version: {detailGame.metadata.latestVersion || 'Unknown'}</p>
                    <p>Status: {detailGame.metadata.status || 'Not set'}</p>
                    <p>Score: {detailGame.metadata.score || 'Not set'}</p>
                    <p>Description: {detailGame.metadata.description || 'No description yet.'}</p>
                    <div className="detail-tags">
                      <strong>Notes</strong>
                      {detailGame.metadata.notes.filter(Boolean).map((note) => (
                        <p key={note}>{note}</p>
                      ))}
                    </div>
                    {detailGame.metadata.tags.length ? (
                      <div className="detail-tags">
                        <strong>Tags</strong>
                        <p>{detailGame.metadata.tags.join(', ')}</p>
                      </div>
                    ) : null}
                    {detailGame.metadata.customTags.length ? (
                      <div className="detail-tags">
                        <strong>Additional tags</strong>
                        {detailGame.metadata.customTags.map((tag) => (
                          <p key={tag.key}>{tag.key}: {tag.value}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <aside className="detail-versions">
                    <div className="detail-versions__header">
                      <strong>Versions</strong>
                      <button className="button button--icon" type="button" onClick={() => void openFolderInExplorer(detailGame.path)}>
                        Open game folder
                      </button>
                    </div>
                    {detailGame.versions.length ? (
                      <ul className="detail-versions__list">
                        {detailGame.versions.map((version) => (
                          <li key={version.path}>
                            <button
                              className="detail-versions__item"
                              type="button"
                              onContextMenu={(event) => {
                                event.preventDefault();
                                void window.gallery.showVersionContextMenu({
                                  versionPath: version.path,
                                  versionName: version.name,
                                });
                              }}
                              onClick={() => void openFolderInExplorer(version.path)}
                              title="Right-click for version folder actions"
                            >
                              <span>{version.name}</span>
                              <span>{version.hasNfo ? 'nfo' : 'no nfo'}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No versions detected.</p>
                    )}
                  </aside>
                </div>
              </section>
              <section className="detail-section panel">
                <div className="detail-section__header">
                  <h3>Screenshots</h3>
                  <button className="button button--icon" type="button" onClick={() => openPicturesModal(detailGame.path)}>
                    Add images
                  </button>
                </div>
                {detailGame.media.screenshots.length ? (
                  <div className="screenshot-grid">
                    {detailGame.media.screenshots.map((imagePath) => (
                      <button
                        key={imagePath}
                        type="button"
                        className="screenshot-grid__item"
                        onClick={() => setScreenshotModalPath(imagePath)}
                      >
                        <img src={filePathToSrc(imagePath) ?? undefined} alt="Screenshot" className="media-preview" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p>No screenshots yet. Placeholder visuals are being used.</p>
                )}
              </section>
            </section>
          ) : null}

          {!detailGame ? (
            <>
          <div className="panel-heading panel-heading--library">
            <div>
              <h2>Games</h2>
              <p>{scanResult.rootPath || 'No folder selected yet.'}</p>
            </div>
            <div className="view-switcher" role="tablist" aria-label="Gallery view mode">
              {(Object.keys(viewModeLabels) as GalleryViewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`view-switcher__button ${viewMode === mode ? 'view-switcher__button--active' : ''}`}
                  aria-selected={viewMode === mode}
                  onClick={() => void changeViewMode(mode)}
                >
                  {viewModeLabels[mode]}
                </button>
              ))}
            </div>
          </div>

          {scanResult.warnings.length > 0 ? (
            <div className="warnings">
              {scanResult.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}

          <div className={`gallery-body gallery-body--${viewMode}`} style={contentScaleStyle}>
            {viewMode === 'compact' || viewMode === 'expanded' ? (
              <div className={`focus-split ${selectedGame ? 'focus-split--open' : ''}`}>
                <div className={`focus-list cards cards--${viewMode}`}>
                  {filteredGames.map((game) => renderGame(game))}
                </div>
                <aside className={`focus-side ${selectedGame ? 'focus-side--visible' : ''}`}>
                  {selectedGame ? renderFocusCard(selectedGame, true) : null}
                </aside>
              </div>
            ) : (
              <div
                className={`cards cards--${viewMode}`}
                ref={cardsContainerRef}
                style={{ ['--grid-columns' as string]: String(gridColumns) } as CSSProperties}
              >
                {viewMode === 'poster' || viewMode === 'card' ? renderInlinePosterCardFocus() : filteredGames.map((game) => renderGame(game))}
              </div>
            )}

            {!filteredGames.length ? (
              <article className="empty-state">
                <h3>{scanResult.games.length ? 'No results for this search' : 'No game folders yet'}</h3>
                <p>
                  {scanResult.games.length
                    ? 'Try a different search term.'
                    : 'Point the app at your main Games folder, save the settings, and the gallery will list each child folder as a game.'}
                </p>
              </article>
            ) : null}
          </div>
          </>
          ) : null}
        </section>
      </section>

      {metadataModalGamePath && metadataDraft ? (
        <div className="modal-backdrop" onClick={closeMetadataModal}>
          <section className="modal-panel modal-panel--metadata" onClick={(event) => event.stopPropagation()}>
            <header className="modal-panel__header">
              <h2>Edit Metadata</h2>
              <button className="button" type="button" onClick={closeMetadataModal}>Close</button>
            </header>
            <div className="modal-panel__body modal-panel__body--metadata">
              <div className="modal-panel__column">
                <label className="field">
                  <span>Latest version</span>
                  <input type="text" value={metadataDraft.latestVersion} onChange={(event) => setMetadataDraft({ ...metadataDraft, latestVersion: event.target.value })} />
                </label>
                <label className="field">
                  <span>Score</span>
                  <input type="text" value={metadataDraft.score} onChange={(event) => setMetadataDraft({ ...metadataDraft, score: event.target.value })} />
                </label>
                <label className="field">
                  <span>Status</span>
                  <CustomSelect
                    ariaLabel="Metadata status"
                    value={metadataDraft.status}
                    options={[
                      { value: '', label: 'Not set' },
                      ...config.statusChoices.map((statusOption) => ({ value: statusOption, label: statusOption })),
                    ]}
                    onChange={(nextValue) => setMetadataDraft({ ...metadataDraft, status: nextValue })}
                  />
                </label>
                <label className="field">
                  <span>Description</span>
                  <textarea rows={4} value={metadataDraft.description} onChange={(event) => setMetadataDraft({ ...metadataDraft, description: event.target.value })} />
                </label>
                <div className="modal-group">
                  <div className="modal-group__header">
                    <strong>Notes</strong>
                    <button className="button button--icon" type="button" onClick={() => setMetadataDraft({ ...metadataDraft, notes: [...metadataDraft.notes, ''] })}>Add note</button>
                  </div>
                  {metadataDraft.notes.map((note, index) => (
                    <div className="tag-row" key={`note-${index}`}>
                      <textarea rows={2} value={note} onChange={(event) => setMetadataDraft({ ...metadataDraft, notes: metadataDraft.notes.map((entry, noteIndex) => noteIndex === index ? event.target.value : entry) })} />
                      <button className="button button--icon" type="button" onClick={() => setMetadataDraft({ ...metadataDraft, notes: metadataDraft.notes.filter((_, noteIndex) => noteIndex !== index) || [''] })}>Remove</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="modal-panel__column modal-panel__column--tags">
                <div className="modal-group modal-group--tight">
                  <div className="modal-group__header">
                    <strong>Tags</strong>
                  </div>
                  <p className="topbar-filters__hint">Click a bubble to edit. Right-click a bubble to remove.</p>
                  <div className="tag-bubbles">
                    {metadataDraft.tags.map((tag, index) => {
                      const isEditing = activeMetadataTagEditorIndex === index;
                      const bubbleLabel = tag.trim() || 'Empty tag';

                      if (isEditing) {
                        return (
                          <div className="tag-bubble tag-bubble--editing" key={`core-tag-${index}`}>
                            <div className="tag-autocomplete">
                              <input
                                type="text"
                                autoFocus
                                value={tag}
                                placeholder="example: roguelike"
                                onFocus={() => setActiveTagAutocomplete({ scope: 'metadata', index, highlighted: 0 })}
                                onBlur={() => {
                                  window.setTimeout(() => {
                                    setMetadataDraft((current) => {
                                      if (!current) {
                                        return current;
                                      }

                                      const nextValue = (current.tags[index] ?? '').trim();
                                      if (nextValue) {
                                        return current;
                                      }

                                      return {
                                        ...current,
                                        tags: current.tags.filter((_, tagIndex) => tagIndex !== index),
                                      };
                                    });
                                    setActiveMetadataTagEditorIndex((current) => (current === index ? null : current));
                                    setActiveTagAutocomplete((current) => {
                                      if (!current || current.scope !== 'metadata' || current.index !== index) {
                                        return current;
                                      }

                                      return null;
                                    });
                                  }, 100);
                                }}
                                onKeyDown={(event) => {
                                  handleTagAutocompleteKeyDown(event, 'metadata', index);
                                  if (event.key === 'Enter' || event.key === 'Escape') {
                                    setActiveMetadataTagEditorIndex(null);
                                    setActiveTagAutocomplete(null);
                                  }
                                }}
                                onChange={(event) => {
                                  setMetadataDraft({
                                    ...metadataDraft,
                                    tags: metadataDraft.tags.map((entry, tagIndex) => (tagIndex === index ? event.target.value : entry)),
                                  });
                                  setActiveTagAutocomplete({ scope: 'metadata', index, highlighted: 0 });
                                }}
                              />
                              {activeTagAutocomplete?.scope === 'metadata' && activeTagAutocomplete.index === index && activeTagSuggestions.length ? (
                                <div className="tag-autocomplete__menu">
                                  {activeTagSuggestions.map((suggestion, suggestionIndex) => (
                                    <button
                                      key={`${suggestion}-${suggestionIndex}`}
                                      className={`tag-autocomplete__item ${activeTagAutocomplete.highlighted === suggestionIndex ? 'tag-autocomplete__item--active' : ''}`}
                                      type="button"
                                      onMouseDown={(event) => {
                                        event.preventDefault();
                                        applyTagSuggestion('metadata', index, suggestion);
                                      }}
                                    >
                                      {suggestion}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <button
                          key={`core-tag-${index}`}
                          className="tag-bubble"
                          type="button"
                          title={bubbleLabel}
                          onClick={() => {
                            setActiveMetadataTagEditorIndex(index);
                            setActiveTagAutocomplete({ scope: 'metadata', index, highlighted: 0 });
                          }}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            setMetadataDraft({
                              ...metadataDraft,
                              tags: metadataDraft.tags.filter((_, tagIndex) => tagIndex !== index),
                            });
                            setActiveMetadataTagEditorIndex(null);
                            setActiveTagAutocomplete(null);
                          }}
                        >
                          {bubbleLabel}
                        </button>
                      );
                    })}
                    <button
                      className="tag-bubble tag-bubble--add"
                      type="button"
                      onClick={() => {
                        const nextIndex = metadataDraft.tags.length;
                        setMetadataDraft({ ...metadataDraft, tags: [...metadataDraft.tags, ''] });
                        setActiveMetadataTagEditorIndex(nextIndex);
                        setActiveTagAutocomplete({ scope: 'metadata', index: nextIndex, highlighted: 0 });
                      }}
                      title="Add tag"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <footer className="modal-panel__footer">
              <button className="button" type="button" onClick={closeMetadataModal}>Cancel</button>
              <button className="button button--primary" type="button" disabled={isMetadataSaving} onClick={() => void saveMetadataChanges()}>
                {isMetadataSaving ? 'Saving...' : 'Save metadata'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {mediaModalGamePath ? (
        <div className="modal-backdrop" onClick={() => setMediaModalGamePath(null)}>
          <section className="modal-panel modal-panel--wide" onClick={(event) => event.stopPropagation()}>
            <header className="modal-panel__header">
              <h2>Manage Pictures</h2>
              <button className="button" type="button" onClick={() => setMediaModalGamePath(null)}>Close</button>
            </header>
            <div className="modal-panel__body">
              {(() => {
                const game = scanResult.games.find((candidate) => candidate.path === mediaModalGamePath);
                if (!game) {
                  return null;
                }

                return (
                  <>
                    <section
                      className={`media-section ${dragSection === 'featured' ? 'media-section--drag' : ''}`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragSection('featured');
                      }}
                      onDragLeave={() => setDragSection((current) => current === 'featured' ? null : current)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDragSection(null);
                        setPendingFeaturedDropPaths(extractDroppedFilePaths(event));
                        setFeaturedImportTarget('poster');
                      }}
                    >
                      <div className="modal-group__header">
                        <strong>Miniature and background media</strong>
                        <button className="button button--icon" type="button" onClick={() => setFeaturedImportTarget('poster')}>Add media</button>
                      </div>
                      {featuredImportTarget ? (
                        <div className="choice-row">
                          <button className="button button--icon" type="button" disabled={isMediaSaving} onClick={() => void importMedia('poster', pendingFeaturedDropPaths.length ? pendingFeaturedDropPaths : undefined)}>Poster</button>
                          <button className="button button--icon" type="button" disabled={isMediaSaving} onClick={() => void importMedia('card', pendingFeaturedDropPaths.length ? pendingFeaturedDropPaths : undefined)}>Card</button>
                          <button className="button button--icon" type="button" disabled={isMediaSaving} onClick={() => void importMedia('background', pendingFeaturedDropPaths.length ? pendingFeaturedDropPaths : undefined)}>Background</button>
                          <button className="button button--icon" type="button" onClick={() => { setFeaturedImportTarget(null); setPendingFeaturedDropPaths([]); }}>Cancel</button>
                        </div>
                      ) : null}
                      <div className="media-grid media-grid--featured">
                        {(['poster', 'card', 'background'] as const).map((key) => (
                          <div className="media-tile" key={key}>
                            <strong>{key}</strong>
                            {game.media[key] ? <img src={filePathToSrc(game.media[key]) ?? undefined} alt={key} className="media-preview" /> : <p>No image</p>}
                          </div>
                        ))}
                      </div>
                    </section>

                    <hr className="media-separator" />

                    <section
                      className={`media-section ${dragSection === 'gallery' ? 'media-section--drag' : ''}`}
                      onDragOver={(event) => {
                        if (draggedScreenshotPath) {
                          event.preventDefault();
                          return;
                        }

                        const dragTypes = Array.from(event.dataTransfer.types);
                        if (!dragTypes.includes('Files')) {
                          return;
                        }

                        event.preventDefault();
                        setDragSection('gallery');
                      }}
                      onDragLeave={() => setDragSection((current) => current === 'gallery' ? null : current)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDragSection(null);
                        if (draggedScreenshotPath) {
                          setDraggedScreenshotPath(null);
                          setDragOverScreenshotPath(null);
                          return;
                        }

                        void importMedia('screenshot', extractDroppedFilePaths(event));
                      }}
                    >
                      <div className="modal-group__header">
                        <strong>Gallery media</strong>
                        <button className="button button--icon" type="button" disabled={isMediaSaving} onClick={() => void importMedia('screenshot')}>Add screenshot</button>
                      </div>
                      <div className="media-grid">
                        {game.media.screenshots.length ? game.media.screenshots.map((imagePath, index) => (
                          <div
                            key={imagePath}
                            className={`media-grid__item ${draggedScreenshotPath === imagePath ? 'media-grid__item--dragging' : ''} ${dragOverScreenshotPath === imagePath ? 'media-grid__item--drop-target' : ''}`}
                            draggable={!isMediaSaving}
                            onDragStart={(event) => {
                              setScreenshotContextMenu(null);
                              setDragSection(null);
                              setDraggedScreenshotPath(imagePath);
                              setDragOverScreenshotPath(null);
                              event.dataTransfer.effectAllowed = 'move';
                              event.dataTransfer.setData('application/x-local-gallery-screenshot', imagePath);
                              event.dataTransfer.setData('text/plain', imagePath);
                            }}
                            onDragEnd={() => {
                              setDraggedScreenshotPath(null);
                              setDragOverScreenshotPath(null);
                            }}
                            onDragOver={(event) => {
                              if (!draggedScreenshotPath || draggedScreenshotPath === imagePath) {
                                return;
                              }

                              event.preventDefault();
                              event.dataTransfer.dropEffect = 'move';
                            }}
                            onDragEnter={() => {
                              if (!draggedScreenshotPath || draggedScreenshotPath === imagePath) {
                                return;
                              }

                              setDragOverScreenshotPath(imagePath);
                            }}
                            onDragLeave={() => {
                              setDragOverScreenshotPath((current) => current === imagePath ? null : current);
                            }}
                            onDrop={(event) => {
                              const fromPath = draggedScreenshotPath || extractDraggedScreenshotPath(event);
                              event.preventDefault();
                              event.stopPropagation();
                              setDraggedScreenshotPath(null);
                              setDragOverScreenshotPath(null);
                              if (!fromPath || fromPath === imagePath) {
                                return;
                              }

                              void reorderScreenshots(fromPath, imagePath);
                            }}
                          >
                            <button
                              type="button"
                              className="media-grid__drag-handle"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (isMediaSaving) {
                                  return;
                                }

                                const rect = event.currentTarget.getBoundingClientRect();
                                setScreenshotContextMenu({
                                  x: Math.round(rect.left),
                                  y: Math.round(rect.bottom + 6),
                                  imagePath,
                                });
                              }}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                if (isMediaSaving) {
                                  return;
                                }

                                setScreenshotContextMenu({
                                  x: event.clientX,
                                  y: event.clientY,
                                  imagePath,
                                });
                              }}
                              title="Screenshot actions"
                            >
                              ...
                            </button>
                            <img src={filePathToSrc(imagePath) ?? undefined} alt="Screenshot" className="media-preview" draggable={false} />
                            <div className="media-grid__reorder">
                              <button
                                className="button button--icon"
                                type="button"
                                disabled={isMediaSaving || index === 0}
                                onClick={() => {
                                  const prev = game.media.screenshots[index - 1];
                                  if (prev) void reorderScreenshots(imagePath, prev);
                                }}
                                aria-label="Move left"
                              >{'◀'}</button>
                              <button
                                className="button button--icon"
                                type="button"
                                disabled={isMediaSaving || index === game.media.screenshots.length - 1}
                                onClick={() => {
                                  const next = game.media.screenshots[index + 1];
                                  if (next) void reorderScreenshots(imagePath, next);
                                }}
                                aria-label="Move right"
                              >{'▶'}</button>
                            </div>
                          </div>
                        )) : <p>No screenshots</p>}
                      </div>
                    </section>
                  </>
                );
              })()}
            </div>
          </section>
          {screenshotContextMenu ? (
            <div
              className="context-menu"
              style={{ left: screenshotContextMenu.x, top: screenshotContextMenu.y }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                className="context-menu__item context-menu__item--danger"
                type="button"
                onClick={() => {
                  void removeScreenshot(screenshotContextMenu.imagePath);
                }}
              >
                Remove screenshot
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {isLogModalOpen ? (
        <div className="modal-backdrop" onClick={() => setIsLogModalOpen(false)}>
          <section className="modal-panel modal-panel--wide" onClick={(event) => event.stopPropagation()}>
            <header className="modal-panel__header">
              <h2>Event logs</h2>
              <button className="button" type="button" onClick={() => setIsLogModalOpen(false)}>Close</button>
            </header>
            <div className="modal-panel__body">
              <div className="log-viewer__filters">
                <label className="field">
                  <span>Level</span>
                  <CustomSelect
                    ariaLabel="Log level filter"
                    value={logLevelFilter}
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'info', label: 'Info' },
                      { value: 'warn', label: 'Warn' },
                      { value: 'error', label: 'Error' },
                    ]}
                    onChange={(nextValue) => setLogLevelFilter(nextValue as 'all' | 'info' | 'warn' | 'error')}
                  />
                </label>
                <label className="field">
                  <span>Date</span>
                  <input type="date" value={logDateFilter} onChange={(event) => setLogDateFilter(event.target.value)} />
                </label>
              </div>
              <pre className="log-viewer">{isLogLoading ? 'Loading logs...' : (filteredLogContents || 'No logs found for current filters.')}</pre>
            </div>
            <footer className="modal-panel__footer">
              <button className="button" type="button" disabled={isLogClearing} onClick={() => void clearLogsFromViewer()}>
                {isLogClearing ? 'Clearing...' : 'Clear logs'}
              </button>
              <button className="button" type="button" onClick={() => setIsLogModalOpen(false)}>Close</button>
            </footer>
          </section>
        </div>
      ) : null}

      {screenshotModalPath ? (
        <div className="modal-backdrop" onClick={() => setScreenshotModalPath(null)}>
          <section className="modal-panel modal-panel--lightbox" onClick={(event) => event.stopPropagation()}>
            <header className="modal-panel__header">
              <h2>Screenshot</h2>
              <button className="button" type="button" onClick={() => setScreenshotModalPath(null)}>Close</button>
            </header>
            <div className="modal-panel__body modal-panel__body--lightbox">
              <img src={filePathToSrc(screenshotModalPath) ?? undefined} alt="Screenshot preview" className="lightbox-image" />
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default App;
