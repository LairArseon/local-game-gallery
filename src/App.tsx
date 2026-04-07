import { FormEvent, Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { GalleryConfig, GalleryViewMode, GameMetadata, GameSummary, ScanResult } from './types';

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
  const [metadataModalGamePath, setMetadataModalGamePath] = useState<string | null>(null);
  const [mediaModalGamePath, setMediaModalGamePath] = useState<string | null>(null);
  const [metadataDraft, setMetadataDraft] = useState<GameMetadata | null>(null);
  const [isMetadataSaving, setIsMetadataSaving] = useState(false);
  const [isMediaSaving, setIsMediaSaving] = useState(false);
  const [featuredImportTarget, setFeaturedImportTarget] = useState<'poster' | 'card' | 'background' | null>(null);
  const [pendingFeaturedDropPaths, setPendingFeaturedDropPaths] = useState<string[]>([]);
  const [dragSection, setDragSection] = useState<'featured' | 'gallery' | null>(null);
  const cardsContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void initialize();
  }, []);

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
    setStatus(`Play action placeholder for ${game.name}.`);
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
      description: game.metadata.description,
      notes: [...game.metadata.notes],
      tags: [...game.metadata.tags],
      customTags: game.metadata.customTags.map((tag) => ({ ...tag })),
    });
    setMetadataModalGamePath(gamePath);
  }

  function openPicturesModal(gamePath: string) {
    setFeaturedImportTarget(null);
    setPendingFeaturedDropPaths([]);
    setMediaModalGamePath(gamePath);
  }

  function extractDroppedFilePaths(event: React.DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer.files)
      .map((file) => (file as File & { path?: string }).path)
      .filter((value): value is string => Boolean(value));
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
      setFeaturedImportTarget(null);
      setPendingFeaturedDropPaths([]);
      setStatus('Pictures updated.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to import pictures.');
    } finally {
      setIsMediaSaving(false);
    }
  }

  function filePathToSrc(filePath: string | null) {
    if (!filePath) {
      return null;
    }

    return encodeURI(`file:///${filePath.replace(/\\/g, '/')}`);
  }

  function toggleGameSelection(path: string) {
    setSelectedGamePath((current) => (current === path ? null : path));
  }

  const filteredGames = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return scanResult.games;
    }

    return scanResult.games.filter((game) => {
      if (game.name.toLowerCase().includes(query)) {
        return true;
      }

      return game.versions.some((version) => version.name.toLowerCase().includes(query));
    });
  }, [scanResult.games, searchQuery]);

  const selectedGame = useMemo(
    () => filteredGames.find((game) => game.path === selectedGamePath) ?? null,
    [filteredGames, selectedGamePath],
  );

  const detailGame = useMemo(
    () => scanResult.games.find((game) => game.path === detailGamePath) ?? null,
    [scanResult.games, detailGamePath],
  );

  useEffect(() => {
    if (viewMode !== 'poster' && viewMode !== 'card') {
      return;
    }

    const container = cardsContainerRef.current;
    if (!container) {
      return;
    }

    const minCardWidth = gridMinCardWidthPx[viewMode];
    const updateColumns = () => {
      const width = container.clientWidth;
      const maxFitColumns = Math.max(1, Math.floor((width + gridGapPx) / (minCardWidth + gridGapPx)));
      const preferredColumns = viewMode === 'poster' ? config?.posterColumns ?? maxFitColumns : config?.cardColumns ?? maxFitColumns;
      const nextColumns = Math.max(1, Math.min(preferredColumns, maxFitColumns));
      setGridColumns(nextColumns);
    };

    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [viewMode, filteredGames.length, detailGamePath, config?.posterColumns, config?.cardColumns]);

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
      setStatus(`Play action placeholder for ${game?.name ?? 'selected game'}.`);
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

  if (!config) {
    return <main className="shell"><section className="panel panel--loading">{status}</section></main>;
  }

  function renderFocusCard(game: GameSummary, isVertical: boolean) {
    const focusImgSrc = isVertical
      ? filePathToSrc(game.media.poster ?? game.media.card)
      : filePathToSrc(game.media.card ?? game.media.poster);
    return (
      <article className={`focus-card panel ${isVertical ? 'focus-card--vertical' : 'focus-card--wide'}`}>
        <div className={`game-card__art ${game.usesPlaceholderArt ? 'game-card__art--placeholder' : ''}`}>
          {focusImgSrc ? (
            <img src={focusImgSrc} alt={game.name} className="media-preview media-preview--cover" />
          ) : null}
          <span>{game.usesPlaceholderArt ? 'Using placeholder art' : `${game.imageCount} images`}</span>
        </div>
        <div className="focus-card__content">
          <h3>{game.name}</h3>
          <p>Latest version: {game.metadata.latestVersion || 'Unknown'}</p>
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
          <div className="game-card__row game-card__row--muted">
            <p>{game.hasNfo ? 'nfo ready' : 'nfo missing'}</p>
            <p>{game.usesPlaceholderArt ? 'placeholder art' : `${game.imageCount} images`}</p>
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
            <p>Score: {game.metadata.score || 'Not set'}</p>
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
            <p>Latest version: {game.metadata.latestVersion || 'Unknown'}</p>
            <p>Score: {game.metadata.score || 'Not set'}</p>
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

  return (
    <main className="shell">
      <header className="topbar panel">
        <div className="topbar__title">
          <p className="eyebrow">Local Game Gallery</p>
          <p>{status}</p>
        </div>
        <div className="topbar__actions">
          <label className="topbar__search" aria-label="Search games">
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Search games or versions"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>
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
              <span>Poster view columns</span>
              <input
                type="number"
                min={1}
                max={12}
                value={config.posterColumns}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    posterColumns: Math.max(1, Number.parseInt(event.target.value || '1', 10) || 1),
                  })
                }
              />
            </label>

            <label className="field">
              <span>Card view columns</span>
              <input
                type="number"
                min={1}
                max={12}
                value={config.cardColumns}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    cardColumns: Math.max(1, Number.parseInt(event.target.value || '1', 10) || 1),
                  })
                }
              />
            </label>

            <button className="button button--primary" type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save setup'}
            </button>
          </form>
        </aside>

        <section className={`panel library ${detailGame ? 'library--detail' : ''}`}>
          {detailGame ? (
            <section className="detail-page">
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
                <h3>All metadata</h3>
                <p>Latest version: {detailGame.metadata.latestVersion || 'Unknown'}</p>
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
                <h3>Screenshots</h3>
                {detailGame.media.screenshots.length ? (
                  <div className="screenshot-grid">
                    {detailGame.media.screenshots.map((imagePath) => (
                      <img key={imagePath} src={filePathToSrc(imagePath) ?? undefined} alt="Screenshot" className="media-preview" />
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

          <div className={`gallery-body gallery-body--${viewMode}`}>
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
          <section className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <header className="modal-panel__header">
              <h2>Edit Metadata</h2>
              <button className="button" type="button" onClick={() => setMetadataModalGamePath(null)}>Close</button>
            </header>
            <div className="modal-panel__body">
              <label className="field">
                <span>Latest version</span>
                <input type="text" value={metadataDraft.latestVersion} onChange={(event) => setMetadataDraft({ ...metadataDraft, latestVersion: event.target.value })} />
              </label>
              <label className="field">
                <span>Score</span>
                <input type="text" value={metadataDraft.score} onChange={(event) => setMetadataDraft({ ...metadataDraft, score: event.target.value })} />
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
              <div className="modal-group">
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
              <div className="modal-group">
                <div className="modal-group__header">
                  <strong>Tags</strong>
                  <button className="button button--icon" type="button" onClick={() => setMetadataDraft({ ...metadataDraft, tags: [...metadataDraft.tags, ''] })}>Add tag</button>
                </div>
                {metadataDraft.tags.map((tag, index) => (
                  <div className="tag-row tag-row--split" key={`core-tag-${index}`}>
                    <input
                      type="text"
                      placeholder="Tag"
                      value={tag}
                      onChange={(event) =>
                        setMetadataDraft({
                          ...metadataDraft,
                          tags: metadataDraft.tags.map((entry, tagIndex) => (tagIndex === index ? event.target.value : entry)),
                        })
                      }
                    />
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
                        event.preventDefault();
                        setDragSection('gallery');
                      }}
                      onDragLeave={() => setDragSection((current) => current === 'gallery' ? null : current)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDragSection(null);
                        void importMedia('screenshot', extractDroppedFilePaths(event));
                      }}
                    >
                      <div className="modal-group__header">
                        <strong>Gallery media</strong>
                        <button className="button button--icon" type="button" disabled={isMediaSaving} onClick={() => void importMedia('screenshot')}>Add screenshot</button>
                      </div>
                      <div className="media-grid">
                        {game.media.screenshots.length ? game.media.screenshots.map((imagePath) => (
                          <img key={imagePath} src={filePathToSrc(imagePath) ?? undefined} alt="Screenshot" className="media-preview" />
                        )) : <p>No screenshots</p>}
                      </div>
                    </section>
                  </>
                );
              })()}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default App;
