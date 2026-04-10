/**
 * App shell and state orchestration for Local Game Gallery.
 *
 * This component owns application-level state, IPC interactions,
 * and delegates most UI rendering to focused child components.
 */
import { FormEvent, Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { ArrowRight, RefreshCw, Settings, SlidersHorizontal, Tag } from 'lucide-react';
import type { AppIconInspectResult, FilterOrderByMode, FilterPreset, GalleryConfig, GalleryViewMode, GameMetadata, GameSummary, ScanResult } from './types';
import { DetailPage } from './components/DetailPage';
import { FilterPanel } from './components/FilterPanel';
import { FocusCard } from './components/FocusCard';
import { GameCard } from './components/GameCard';
import { LogViewerModal } from './components/LogViewerModal';
import { MediaModal } from './components/MediaModal';
import { MetadataModal } from './components/MetadataModal';
import { SetupPanel } from './components/SetupPanel';
import { TagPoolPanel } from './components/TagPoolPanel';
import {
  clamp,
  computeTagPoolUsage,
  formatLastPlayed,
  isTypingTarget,
  normalizeMetadataTags,
  normalizeTagPool,
  normalizeTagRules,
  normalizedScore,
} from './utils/app-helpers';

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
  const [appIconSummary, setAppIconSummary] = useState<AppIconInspectResult | null>(null);
  const [appIconPreviewVersion, setAppIconPreviewVersion] = useState(0);
  const [isAppIconDragActive, setIsAppIconDragActive] = useState(false);
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
  const appIconDragDepthRef = useRef(0);

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

  useEffect(() => {
    if (!config) {
      return;
    }

    const iconPath = config.appIconPngPath.trim();
    if (!iconPath) {
      setAppIconSummary(null);
      return;
    }

    const inspectCurrentIcon = async () => {
      try {
        const inspection = await window.gallery.inspectAppIconFile({ filePath: iconPath });
        setAppIconSummary(inspection);
      } catch {
        setAppIconSummary({
          isValid: false,
          message: 'Could not validate current app icon path.',
          width: 0,
          height: 0,
          willPadToSquare: false,
        });
      }
    };

    void inspectCurrentIcon();
  }, [config?.appIconPngPath, config]);

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

  async function setAppIconPath(candidatePath: string) {
    const iconPath = candidatePath.trim();
    if (!iconPath || !config) {
      return;
    }

    try {
      const inspection = await window.gallery.inspectAppIconFile({ filePath: iconPath });
      setAppIconSummary(inspection);
      if (!inspection.isValid) {
        setStatus(inspection.message);
        return;
      }

      setConfig({
        ...config,
        appIconPngPath: iconPath,
      });
      setAppIconPreviewVersion((current) => current + 1);
      setStatus('App icon selected. Save setup to persist it.');
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to inspect app icon file.');
      setStatus(message);
      void logAppEvent(message, 'error', 'select-app-icon');
    }
  }

  async function pickAppIconPng() {
    try {
      const selectedPath = await window.gallery.pickAppIconPng();
      if (!selectedPath) {
        return;
      }

      await setAppIconPath(selectedPath);
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to pick app icon file.');
      setStatus(message);
      void logAppEvent(message, 'error', 'pick-app-icon');
    }
  }

  async function handleDropAppIconFile(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    appIconDragDepthRef.current = 0;
    setIsAppIconDragActive(false);

    const droppedFile = event.dataTransfer.files?.[0] as (File & { path?: string }) | undefined;
    let droppedPath = String(droppedFile?.path ?? '').trim();

    if (!droppedPath) {
      const uriList = event.dataTransfer.getData('text/uri-list').trim();
      const plainText = event.dataTransfer.getData('text/plain').trim();
      const firstCandidate = (uriList || plainText).split(/\r?\n/).find(Boolean) ?? '';
      if (firstCandidate) {
        const decoded = decodeURI(firstCandidate.trim());
        if (decoded.toLowerCase().startsWith('file:///')) {
          droppedPath = decoded.replace(/^file:\/\//i, '');
        } else if (/^[a-zA-Z]:[\\/]/.test(decoded)) {
          droppedPath = decoded;
        }
      }
    }

    if (droppedPath.startsWith('/') && /^[a-zA-Z]:[\\/]/.test(droppedPath.slice(1))) {
      droppedPath = droppedPath.slice(1);
    }

    droppedPath = droppedPath.replace(/\//g, '\\');
    if (!droppedPath) {
      if (droppedFile) {
        try {
          const stagedPath = await window.gallery.stageDroppedAppIcon({
            fileName: droppedFile.name,
            buffer: await droppedFile.arrayBuffer(),
          });
          await setAppIconPath(stagedPath);
          return;
        } catch (error) {
          const message = toErrorMessage(error, 'Could not process dropped icon file.');
          setStatus(message);
          void logAppEvent(message, 'error', 'drop-app-icon-stage');
          return;
        }
      }

      setStatus('Could not read dropped file path. Use the picker button instead.');
      return;
    }

    await setAppIconPath(droppedPath);
  }

  function handleAppIconDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    appIconDragDepthRef.current += 1;
    setIsAppIconDragActive(true);
  }

  function handleAppIconDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    appIconDragDepthRef.current = Math.max(0, appIconDragDepthRef.current - 1);
    if (appIconDragDepthRef.current === 0) {
      setIsAppIconDragActive(false);
    }
  }

  function resetAppIcon() {
    if (!config) {
      return;
    }

    setConfig({
      ...config,
      appIconPngPath: '',
    });
    setAppIconSummary(null);
    setAppIconPreviewVersion((current) => current + 1);
    setStatus('App icon reset to default. Save setup to persist it.');
  }

  async function applyAppIconNow() {
    if (!config?.appIconPngPath) {
      setStatus('Select an icon first.');
      return;
    }

    try {
      const result = await window.gallery.applyRuntimeAppIcon({ filePath: config.appIconPngPath });
      setStatus(result.message);
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to apply runtime icon.');
      setStatus(message);
      void logAppEvent(message, 'error', 'apply-runtime-icon');
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

  function toggleGameSelection(path: string) {
    setSelectedGamePath((current) => (current === path ? null : path));
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

  const mediaModalGame = useMemo(
    () => scanResult.games.find((candidate) => candidate.path === mediaModalGamePath) ?? null,
    [scanResult.games, mediaModalGamePath],
  );

  if (!config) {
    return <main className="shell"><section className="panel panel--loading">{status}</section></main>;
  }

  function renderFocusCard(game: GameSummary, isVertical: boolean, showActions = true) {
    const hasScreenshotCarousel = game.media.screenshots.length > 0;
    const carouselIndex = hasScreenshotCarousel ? (focusCarouselIndexByGamePath[game.path] ?? 0) : 0;

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
      <FocusCard
        game={game}
        isVertical={isVertical}
        showActions={showActions}
        carouselIndex={carouselIndex}
        getImageSrc={filePathToSrc}
        onMoveCarousel={moveFocusCarousel}
        onOpenScreenshot={setScreenshotModalPath}
        onPlayClick={handlePlayClick}
        onOpenDetail={handleOpenDetail}
        actionLabels={actionLabels}
      />
    );
  }

  function renderGame(game: GameSummary) {
    return (
      <GameCard
        key={game.path}
        game={game}
        viewMode={viewMode}
        isSelected={selectedGamePath === game.path}
        actionLabels={actionLabels}
        getImageSrc={filePathToSrc}
        onToggleSelection={toggleGameSelection}
        onPlayClick={handlePlayClick}
        onOpenDetail={handleOpenDetail}
        onContextMenu={(targetGame, event) => {
          event.preventDefault();
          void window.gallery.showGameContextMenu({
            gamePath: targetGame.path,
            gameName: targetGame.name,
          });
        }}
      />
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
  const appIconPreviewSrc = config.appIconPngPath
    ? `${encodeURI(`file:///${config.appIconPngPath.replace(/\\/g, '/')}`)}?v=${appIconPreviewVersion}`
    : null;

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
          <TagPoolPanel
            tagPool={config.tagPool}
            tagPoolUsage={config.tagPoolUsage}
            activeTagPoolEditorIndex={activeTagPoolEditorIndex}
            activeTagAutocomplete={activeTagAutocomplete}
            activeTagSuggestions={activeTagSuggestions}
            onStartEdit={(index) => {
              setTagPoolEditorOriginalValue(config.tagPool[index] ?? '');
              setActiveTagPoolEditorIndex(index);
              setActiveTagAutocomplete({ scope: 'pool', index, highlighted: 0 });
            }}
            onRemoveTag={(index) => {
              void removeTagFromPoolByIndex(index);
              setActiveTagPoolEditorIndex(null);
              setActiveTagAutocomplete(null);
            }}
            onFinalizeEdit={(index) => {
              void finalizeTagPoolEdit(index);
            }}
            onEditorValueChange={(index, value) => {
              setConfig((current) => {
                if (!current) {
                  return current;
                }

                return {
                  ...current,
                  tagPool: current.tagPool.map((entry, tagIndex) => (tagIndex === index ? value : entry)),
                };
              });
            }}
            onSetAutocomplete={setActiveTagAutocomplete}
            onEditorKeyDown={(event, index) => {
              handleTagAutocompleteKeyDown(event, 'pool', index);
              if (event.key === 'Enter' || event.key === 'Escape') {
                event.preventDefault();
                void finalizeTagPoolEdit(index);
              }
            }}
            onApplySuggestion={(index, suggestion) => {
              applyTagSuggestion('pool', index, suggestion);
            }}
            onAddTag={() => {
              const nextIndex = config.tagPool.length;
              const nextPool = [...config.tagPool, ''];
              setConfig({ ...config, tagPool: nextPool });
              setTagPoolEditorOriginalValue('');
              setActiveTagPoolEditorIndex(nextIndex);
              setActiveTagAutocomplete({ scope: 'pool', index: nextIndex, highlighted: 0 });
            }}
          />
        ) : null}
        {isFilterPanelOpen ? (
          <FilterPanel
            draftTagRules={draftTagRules}
            activeFilterRuleEditorIndex={activeFilterRuleEditorIndex}
            activeTagAutocomplete={activeTagAutocomplete}
            activeTagSuggestions={activeTagSuggestions}
            topUsedFilterSuggestions={topUsedFilterSuggestions}
            draftMinScore={draftMinScore}
            draftOrderBy={draftOrderBy}
            draftStatus={draftStatus}
            orderByModeLabels={orderByModeLabels}
            statusChoices={config.statusChoices}
            isPresetNamingOpen={isPresetNamingOpen}
            draftPresetName={draftPresetName}
            isPresetSaving={isPresetSaving}
            filterPresets={config.filterPresets}
            onSetActiveTagAutocomplete={setActiveTagAutocomplete}
            onStartEditRule={(index) => {
              setActiveFilterRuleEditorIndex(index);
              setActiveTagAutocomplete({ scope: 'filter', index, highlighted: 0 });
            }}
            onRemoveRule={(index) => {
              setDraftTagRules((current) => current.filter((_, ruleIndex) => ruleIndex !== index));
              setActiveFilterRuleEditorIndex(null);
              setActiveTagAutocomplete(null);
            }}
            onFinalizeRuleBlur={(index) => {
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
            }}
            onHandleRuleKeyDown={(event, index) => {
              handleTagAutocompleteKeyDown(event, 'filter', index);
              if (event.key === 'Enter' || event.key === 'Escape') {
                setActiveFilterRuleEditorIndex(null);
                setActiveTagAutocomplete(null);
              }
            }}
            onUpdateRule={(index, value) => {
              setDraftTagRules((current) => current.map((entry, ruleIndex) => (ruleIndex === index ? value : entry)));
            }}
            onApplyRuleSuggestion={(index, suggestion) => {
              applyTagSuggestion('filter', index, suggestion);
            }}
            onAddRule={() => {
              const nextIndex = draftTagRules.length;
              setDraftTagRules((current) => [...current, '']);
              setActiveFilterRuleEditorIndex(nextIndex);
              setActiveTagAutocomplete({ scope: 'filter', index: nextIndex, highlighted: 0 });
            }}
            onAddSuggestionTag={(tag) => {
              setDraftTagRules((current) => [...current, tag]);
              setActiveFilterRuleEditorIndex(null);
              setActiveTagAutocomplete(null);
            }}
            onChangeDraftMinScore={setDraftMinScore}
            onChangeDraftOrderBy={setDraftOrderBy}
            onChangeDraftStatus={setDraftStatus}
            onBeginSavePreset={beginSavePreset}
            onChangeDraftPresetName={setDraftPresetName}
            onSaveCurrentFilterPreset={() => {
              void saveCurrentFilterPreset();
            }}
            onCancelPresetNaming={() => {
              setIsPresetNamingOpen(false);
              setDraftPresetName('');
            }}
            onLoadFilterPreset={loadFilterPresetToDraft}
            onDeleteFilterPreset={(name) => {
              void deleteFilterPreset(name);
            }}
            onResetStagedFilters={resetStagedFilters}
            onApplyFiltersAndOrdering={applyFiltersAndOrdering}
          />
        ) : null}
      </header>

      <section className={`layout ${detailGame ? 'layout--detail' : ''}`}>
        <SetupPanel
          config={config}
          isSidebarOpen={isSidebarOpen}
          isSaving={isSaving}
          chooseLibraryFolderLabel={actionLabels.chooseLibraryFolder}
          onSaveConfig={saveConfig}
          onPickRoot={pickRoot}
          onConfigChange={setConfig}
          onToggleSystemMenuBar={(nextVisible) => {
            void window.gallery.setMenuBarVisibility(nextVisible);
            void logAppEvent(`System menu bar ${nextVisible ? 'shown' : 'hidden'} from setup toggle.`, 'info', 'menu-bar');
          }}
          onOpenLogViewer={() => {
            void openLogViewer();
          }}
          onOpenLogFolder={() => {
            void openLogFolderFromSetup();
          }}
          appIconPreviewSrc={appIconPreviewSrc}
          appIconSummary={appIconSummary}
          appIconPath={config.appIconPngPath}
          onPickAppIcon={() => {
            void pickAppIconPng();
          }}
          onDropAppIconFile={(event) => {
            void handleDropAppIconFile(event);
          }}
          onAppIconDragEnter={handleAppIconDragEnter}
          onAppIconDragLeave={handleAppIconDragLeave}
          isAppIconDragActive={isAppIconDragActive}
          onApplyAppIconNow={() => {
            void applyAppIconNow();
          }}
          onResetAppIcon={resetAppIcon}
        />

        <section
          className={`panel library ${detailGame ? 'library--detail' : ''} ${detailBackgroundSrc ? 'library--detail-bg' : ''}`}
          style={detailBackgroundSrc ? ({ ['--detail-bg-image' as string]: `url("${detailBackgroundSrc}")` } as CSSProperties) : undefined}
        >
          {detailGame ? (
            <DetailPage
              game={detailGame}
              contentScaleStyle={contentScaleStyle}
              actionLabels={actionLabels}
              focusCard={renderFocusCard(detailGame, true, false)}
              getImageSrc={filePathToSrc}
              onBack={() => setDetailGamePath(null)}
              onPlay={handlePlayClick}
              onOpenMetadata={openMetadataModal}
              onOpenGameFolder={(gamePath) => {
                void openFolderInExplorer(gamePath);
              }}
              onOpenVersionFolder={(versionPath) => {
                void openFolderInExplorer(versionPath);
              }}
              onOpenVersionContextMenu={(versionPath, versionName) => {
                void window.gallery.showVersionContextMenu({
                  versionPath,
                  versionName,
                });
              }}
              onOpenPictures={openPicturesModal}
              onOpenScreenshot={setScreenshotModalPath}
            />
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
        <MetadataModal
          metadataDraft={metadataDraft}
          statusChoices={config.statusChoices}
          activeMetadataTagEditorIndex={activeMetadataTagEditorIndex}
          activeTagAutocomplete={activeTagAutocomplete}
          activeTagSuggestions={activeTagSuggestions}
          isMetadataSaving={isMetadataSaving}
          onClose={closeMetadataModal}
          onSave={() => {
            void saveMetadataChanges();
          }}
          onSetMetadataDraft={(updater) => {
            setMetadataDraft((current) => {
              if (!current) {
                return current;
              }

              return typeof updater === 'function'
                ? (updater as (entry: typeof current) => typeof current)(current)
                : updater;
            });
          }}
          onSetActiveMetadataTagEditorIndex={setActiveMetadataTagEditorIndex}
          onSetActiveTagAutocomplete={setActiveTagAutocomplete}
          onHandleTagAutocompleteKeyDown={handleTagAutocompleteKeyDown}
          onApplyTagSuggestion={applyTagSuggestion}
        />
      ) : null}

      <MediaModal
        game={mediaModalGame}
        isOpen={Boolean(mediaModalGamePath && mediaModalGame)}
        isMediaSaving={isMediaSaving}
        featuredImportTarget={featuredImportTarget}
        pendingFeaturedDropPaths={pendingFeaturedDropPaths}
        dragSection={dragSection}
        draggedScreenshotPath={draggedScreenshotPath}
        dragOverScreenshotPath={dragOverScreenshotPath}
        screenshotContextMenu={screenshotContextMenu}
        getImageSrc={filePathToSrc}
        setFeaturedImportTarget={setFeaturedImportTarget}
        setPendingFeaturedDropPaths={setPendingFeaturedDropPaths}
        setDragSection={setDragSection}
        setDraggedScreenshotPath={setDraggedScreenshotPath}
        setDragOverScreenshotPath={setDragOverScreenshotPath}
        setScreenshotContextMenu={setScreenshotContextMenu}
        onClose={() => setMediaModalGamePath(null)}
        onImportMedia={importMedia}
        onReorderScreenshots={reorderScreenshots}
        onRemoveScreenshot={removeScreenshot}
      />

      {isLogModalOpen ? (
        <LogViewerModal
          isLogLoading={isLogLoading}
          isLogClearing={isLogClearing}
          filteredLogContents={filteredLogContents}
          logLevelFilter={logLevelFilter}
          logDateFilter={logDateFilter}
          onClose={() => setIsLogModalOpen(false)}
          onChangeLogLevel={(nextValue) => setLogLevelFilter(nextValue)}
          onChangeDateFilter={(nextValue) => setLogDateFilter(nextValue)}
          onClearLogs={() => void clearLogsFromViewer()}
        />
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
