import { FormEvent, Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [draftTagRules, setDraftTagRules] = useState<string[]>([]);
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
    scope: 'filter' | 'metadata';
    index: number;
    highlighted: number;
  } | null>(null);
  const cardsContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void initialize();
  }, []);

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

  async function initialize() {
    try {
      const loadedConfig = await window.gallery.getConfig();
      setConfig(loadedConfig);
      setViewMode(loadedConfig.preferredViewMode ?? 'poster');
      setIsSidebarOpen(!loadedConfig.gamesRoot);
      setStatus(loadedConfig.gamesRoot ? 'Ready to scan your library.' : 'Pick a root folder to begin.');

      if (loadedConfig.gamesRoot) {
        await refreshScan();
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load configuration.');
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
      setStatus(error instanceof Error ? error.message : 'Failed to open folder picker.');
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
      setStatus('Configuration saved.');
      await refreshScan();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save configuration.');
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
    } catch (error) {
      setScanResult(emptyScan);
      setStatus(error instanceof Error ? error.message : 'Failed to scan game folders.');
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
      setStatus(error instanceof Error ? error.message : 'Failed to launch game.');
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
    setMetadataModalGamePath(gamePath);
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

    setIsMetadataSaving(true);
    try {
      await window.gallery.saveGameMetadata({
        gamePath: game.path,
        title: game.name,
        metadata: {
          ...metadataDraft,
          notes: metadataDraft.notes.length ? metadataDraft.notes : [''],
          tags: [...new Set(metadataDraft.tags.map((tag) => tag.trim()).filter(Boolean))],
        },
      });
      await refreshScan();
      setMetadataModalGamePath(null);
      setStatus('Metadata saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save metadata.');
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
      setStatus(error instanceof Error ? error.message : 'Failed to import pictures.');
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
      setStatus(error instanceof Error ? error.message : 'Failed to reorder screenshots.');
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
      setStatus(error instanceof Error ? error.message : 'Failed to remove screenshot.');
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

  function normalizeTagRules(rules: string[]) {
    return rules.map((entry) => entry.trim()).filter(Boolean);
  }

  const knownTags = useMemo(() => {
    const uniqueTags = new Map<string, string>();

    for (const game of scanResult.games) {
      for (const tag of game.metadata.tags) {
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
  }, [scanResult.games, metadataDraft]);

  const activeTagSuggestions = useMemo(() => {
    if (!activeTagAutocomplete) {
      return [] as string[];
    }

    const sourceValue = activeTagAutocomplete.scope === 'filter'
      ? draftTagRules[activeTagAutocomplete.index] ?? ''
      : metadataDraft?.tags[activeTagAutocomplete.index] ?? '';

    const withoutPrefix = sourceValue.trim().startsWith('-') ? sourceValue.trim().slice(1).trim() : sourceValue.trim();
    const query = withoutPrefix.toLowerCase();
    if (!query) {
      return [] as string[];
    }

    return knownTags
      .filter((tag) => tag.toLowerCase().includes(query))
      .slice(0, 8);
  }, [activeTagAutocomplete, draftTagRules, metadataDraft, knownTags]);

  function applyTagSuggestion(scope: 'filter' | 'metadata', index: number, suggestion: string) {
    if (scope === 'filter') {
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
    scope: 'filter' | 'metadata',
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
      setStatus(error instanceof Error ? error.message : 'Failed to save filter preset.');
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
      setStatus(error instanceof Error ? error.message : 'Failed to delete filter preset.');
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
  const effectiveMediaScale = clamp((effectiveFontScale + effectiveSpacingScale) / 2, 0.7, 1.6);
  const contentScaleStyle = {
    ['--content-font-scale' as string]: effectiveFontScale.toFixed(3),
    ['--content-spacing-scale' as string]: effectiveSpacingScale.toFixed(3),
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

  function renderFocusCard(game: GameSummary, isVertical: boolean) {
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
          <p>{game.metadata.description || 'No description yet.'}</p>
          {game.metadata.notes.filter(Boolean).slice(0, 2).map((note) => (
            <p key={note}>Note: {note}</p>
          ))}
          {game.metadata.tags.length ? <p>Tags: {game.metadata.tags.join(', ')}</p> : null}
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
        <button className="button button--icon" type="button" onClick={(event) => handlePlayClick(game, event)}>
          Play
        </button>
        <button className="button button--icon" type="button" onClick={(event) => handleOpenDetail(game, event)}>
          Open
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
            <p>{game.versionCount} versions</p>
          </div>
          <div className="game-card__compact-meta">
            <p><strong>Status:</strong> {game.metadata.status || 'Not set'}</p>
            <p><strong>Score:</strong> {game.metadata.score || 'Not set'}</p>
            <p className="game-card__compact-description"><strong>Description:</strong> {compactDescription || 'No description yet.'}</p>
            <p><strong>Tags:</strong> {compactTags.length ? compactTags.join(', ') : 'None'}</p>
          </div>
          {commonActions}
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
            <p>{game.versionCount} versions detected</p>
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
          <div className="game-card__body">
            <h3>{game.name}</h3>
            <p>Status: {game.metadata.status || 'Not set'}</p>
            <p>Score: {game.metadata.score || 'Not set'}</p>
            <p>Tags: {game.metadata.tags.length ? game.metadata.tags.join(', ') : 'None'}</p>
            <p>{game.metadata.description || 'No description yet.'}</p>
            {game.metadata.notes.filter(Boolean).slice(0, 2).map((note) => (
              <p key={note}>Note: {note}</p>
            ))}
            {bootstrapText ? <p>Bootstrapped: {bootstrapText}</p> : null}
            {commonActions}
            <ul className="version-list">
              {game.versions.map((version) => (
                <li key={version.path}>
                  <span>{version.name}</span>
                  <span>{version.hasNfo ? 'nfo' : 'no nfo'}</span>
                </li>
              ))}
            </ul>
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
          <p>{game.versionCount} versions</p>
          <p>Status: {game.metadata.status || 'Not set'}</p>
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
          <p>{status}</p>
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
            <button className="button" type="button" onClick={() => setIsFilterPanelOpen((current) => !current)}>
              {isFilterPanelOpen ? 'Hide filters' : 'Show filters'}
            </button>
          </div>
          <button className="button" type="button" onClick={() => setIsSidebarOpen((current) => !current)}>
            {isSidebarOpen ? 'Hide setup' : 'Show setup'}
          </button>
          <button className="button" type="button" onClick={() => void refreshScan()} disabled={isScanning}>
            {isScanning ? 'Scanning...' : 'Rescan'}
          </button>
          <button className="button button--primary" type="button" onClick={pickRoot} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Choose library folder'}
          </button>
        </div>
        {isFilterPanelOpen ? (
          <section className="topbar-filters">
            <div className="topbar-filters__grid">
              <div className="topbar-filters__group">
                <div className="topbar-filters__heading">
                  <strong>Tag rules</strong>
                  <button className="button button--icon" type="button" onClick={() => setDraftTagRules((current) => [...current, ''])}>
                    Add rule
                  </button>
                </div>
                <p className="topbar-filters__hint">Use tags as include rules. Prefix with - to exclude a tag.</p>
                {draftTagRules.map((rule, index) => (
                  <div className="topbar-filters__rule" key={`filter-rule-${index}`}>
                    <div className="tag-autocomplete">
                      <input
                        type="text"
                        value={rule}
                        placeholder="example: roguelike or -horror"
                        onFocus={() => setActiveTagAutocomplete({ scope: 'filter', index, highlighted: 0 })}
                        onBlur={() => {
                          window.setTimeout(() => {
                            setActiveTagAutocomplete((current) => {
                              if (!current || current.scope !== 'filter' || current.index !== index) {
                                return current;
                              }

                              return null;
                            });
                          }, 100);
                        }}
                        onKeyDown={(event) => handleTagAutocompleteKeyDown(event, 'filter', index)}
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
                    <button
                      className="button button--icon"
                      type="button"
                      onClick={() => setDraftTagRules((current) => current.filter((_, ruleIndex) => ruleIndex !== index))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <div className="topbar-filters__group">
                <label className="field">
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

                <label className="field">
                  <span>Status</span>
                  <select value={draftStatus} onChange={(event) => setDraftStatus(event.target.value)}>
                    <option value="">Any status</option>
                    {config.statusChoices.map((statusOption) => (
                      <option key={statusOption} value={statusOption}>
                        {statusOption}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Order by</span>
                  <select value={draftOrderBy} onChange={(event) => setDraftOrderBy(event.target.value as FilterOrderByMode)}>
                    {(Object.keys(orderByModeLabels) as FilterOrderByMode[]).map((mode) => (
                      <option key={mode} value={mode}>
                        {orderByModeLabels[mode]}
                      </option>
                    ))}
                  </select>
                </label>

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
              <input
                type="text"
                value={config.gamesRoot}
                onChange={(event) => setConfig({ ...config, gamesRoot: event.target.value })}
                placeholder="D:\\Games or /home/you/Games"
              />
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
                <button className="button" type="button" onClick={() => setDetailGamePath(null)}>
                  Back
                </button>
                <h2>{detailGame.name}</h2>
                <button className="button button--primary" type="button" onClick={(event) => handlePlayClick(detailGame, event)}>
                  Play
                </button>
              </header>
              {renderFocusCard(detailGame, true)}
              <section className="detail-section panel">
                <div className="detail-section__header">
                  <h3>All metadata</h3>
                  <button className="button button--icon" type="button" onClick={() => openMetadataModal(detailGame.path)}>
                    Edit metadata
                  </button>
                </div>
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
        <div className="modal-backdrop" onClick={() => setMetadataModalGamePath(null)}>
          <section className="modal-panel modal-panel--metadata" onClick={(event) => event.stopPropagation()}>
            <header className="modal-panel__header">
              <h2>Edit Metadata</h2>
              <button className="button" type="button" onClick={() => setMetadataModalGamePath(null)}>Close</button>
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
                  <select value={metadataDraft.status} onChange={(event) => setMetadataDraft({ ...metadataDraft, status: event.target.value })}>
                    <option value="">Not set</option>
                    {config.statusChoices.map((statusOption) => (
                      <option key={statusOption} value={statusOption}>
                        {statusOption}
                      </option>
                    ))}
                  </select>
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
                    <button className="button button--icon" type="button" onClick={() => setMetadataDraft({ ...metadataDraft, tags: [...metadataDraft.tags, ''] })}>Add tag</button>
                  </div>
                  {metadataDraft.tags.map((tag, index) => (
                    <div className="tag-row tag-row--split" key={`core-tag-${index}`}>
                      <div className="tag-autocomplete">
                        <input
                          type="text"
                          placeholder="Tag"
                          value={tag}
                          onFocus={() => setActiveTagAutocomplete({ scope: 'metadata', index, highlighted: 0 })}
                          onBlur={() => {
                            window.setTimeout(() => {
                              setActiveTagAutocomplete((current) => {
                                if (!current || current.scope !== 'metadata' || current.index !== index) {
                                  return current;
                                }

                                return null;
                              });
                            }, 100);
                          }}
                          onKeyDown={(event) => handleTagAutocompleteKeyDown(event, 'metadata', index)}
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
                      <div />
                      <button
                        className="button button--icon"
                        type="button"
                        onClick={() =>
                          setMetadataDraft({
                            ...metadataDraft,
                            tags: metadataDraft.tags.filter((_, tagIndex) => tagIndex !== index),
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <div className="modal-group modal-group--tight">
                  <div className="modal-group__header">
                    <strong>Additional tags</strong>
                    <button className="button button--icon" type="button" onClick={() => setMetadataDraft({ ...metadataDraft, customTags: [...metadataDraft.customTags, { key: '', value: '' }] })}>Add tag</button>
                  </div>
                  {metadataDraft.customTags.map((tag, index) => (
                    <div className="tag-row tag-row--split" key={`tag-${index}`}>
                      <input type="text" placeholder="Tag" value={tag.key} onChange={(event) => setMetadataDraft({ ...metadataDraft, customTags: metadataDraft.customTags.map((entry, tagIndex) => tagIndex === index ? { ...entry, key: event.target.value } : entry) })} />
                      <input type="text" placeholder="Value" value={tag.value} onChange={(event) => setMetadataDraft({ ...metadataDraft, customTags: metadataDraft.customTags.map((entry, tagIndex) => tagIndex === index ? { ...entry, value: event.target.value } : entry) })} />
                      <button className="button button--icon" type="button" onClick={() => setMetadataDraft({ ...metadataDraft, customTags: metadataDraft.customTags.filter((_, tagIndex) => tagIndex !== index) })}>Remove</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <footer className="modal-panel__footer">
              <button className="button" type="button" onClick={() => setMetadataModalGamePath(null)}>Cancel</button>
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
