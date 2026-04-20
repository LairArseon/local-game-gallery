import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { DebugOverlayPortal } from '../debug-tools/DebugOverlayPortal';
import { resolveGalleryDebugFlags } from '../debug-tools/flags';

type ScanResultLike = {
  rootPath: string;
  warnings: string[];
  usingMirrorFallback: boolean;
  games: unknown[];
};

type LibraryPanelProps<TGame, TViewMode extends string, TScanResult extends ScanResultLike> = {
  isNarrowViewport: boolean;
  detailGame: TGame | null;
  detailBackgroundSrc: string | null;
  contentScaleStyle: CSSProperties;
  viewModes: readonly TViewMode[];
  viewMode: TViewMode;
  viewModeLabels: Record<TViewMode, string>;
  onChangeViewMode: (mode: TViewMode) => void;
  filteredGames: TGame[];
  selectedGame: TGame | null;
  cardsContainerRef: RefObject<HTMLDivElement | null>;
  gridColumns: number;
  scanResult: TScanResult;
  renderDetailPage: (game: TGame) => ReactNode;
  renderFocusCard: (game: TGame, isVertical: boolean, showActions?: boolean) => ReactNode;
  renderInlinePosterCardFocus: () => ReactNode;
  renderGame: (game: TGame) => ReactNode;
};

export function LibraryPanel<TGame, TViewMode extends string, TScanResult extends ScanResultLike>({
  isNarrowViewport,
  detailGame,
  detailBackgroundSrc,
  contentScaleStyle,
  viewModes,
  viewMode,
  viewModeLabels,
  onChangeViewMode,
  filteredGames,
  selectedGame,
  cardsContainerRef,
  gridColumns,
  scanResult,
  renderDetailPage,
  renderFocusCard,
  renderInlinePosterCardFocus,
  renderGame,
}: LibraryPanelProps<TGame, TViewMode, TScanResult>) {
  const { t } = useTranslation();
  const previousViewModeRef = useRef<TViewMode>(viewMode);
  const [isPosterCardSwitching, setIsPosterCardSwitching] = useState(false);
  const [posterCardRowStride, setPosterCardRowStride] = useState(420);
  const [virtualStartRow, setVirtualStartRow] = useState(0);
  const [virtualEndRow, setVirtualEndRow] = useState(0);
  const virtualWindowRef = useRef({ start: 0, end: 0 });
  const isDevBuild = Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
  const debugFlags = useMemo(() => resolveGalleryDebugFlags(isDevBuild), [isDevBuild]);

  const isPosterCardView = viewMode === 'poster' || viewMode === 'card';
  const shouldVirtualizePosterCard = (isNarrowViewport || debugFlags.forceVirtualization)
    && isPosterCardView
    && !isPosterCardSwitching
    && filteredGames.length > 60;
  const totalPosterCardRows = Math.ceil(filteredGames.length / Math.max(gridColumns, 1));

  useLayoutEffect(() => {
    const previousViewMode = previousViewModeRef.current;
    previousViewModeRef.current = viewMode;

    if (!isPosterCardView || previousViewMode === viewMode || !filteredGames.length) {
      setIsPosterCardSwitching(false);
      return;
    }

    setIsPosterCardSwitching(true);
    const revealTimer = window.setTimeout(() => {
      setIsPosterCardSwitching(false);
    }, 150);

    return () => {
      window.clearTimeout(revealTimer);
    };
  }, [filteredGames.length, isPosterCardView, viewMode]);

  const skeletonCount = useMemo(() => {
    if (!filteredGames.length) {
      return 0;
    }

    const estimatedVisible = Math.max(6, gridColumns * 2);
    return Math.min(filteredGames.length, estimatedVisible);
  }, [filteredGames.length, gridColumns]);

  const shouldShowTopWarnings = !scanResult.usingMirrorFallback && scanResult.warnings.length > 0;

  useLayoutEffect(() => {
    if (!shouldVirtualizePosterCard) {
      return;
    }

    const cardsContainer = cardsContainerRef.current;
    if (!cardsContainer) {
      return;
    }

    const firstCard = cardsContainer.querySelector('.game-card');
    if (!(firstCard instanceof HTMLElement)) {
      return;
    }

    const styles = window.getComputedStyle(cardsContainer);
    const rowGap = Number.parseFloat(styles.rowGap || styles.gap || '0') || 0;
    const nextStride = Math.max(140, firstCard.offsetHeight + rowGap);
    if (Number.isFinite(nextStride) && Math.abs(nextStride - posterCardRowStride) > 1) {
      setPosterCardRowStride(nextStride);
    }
  }, [cardsContainerRef, filteredGames.length, posterCardRowStride, shouldVirtualizePosterCard, viewMode]);

  useEffect(() => {
    if (!shouldVirtualizePosterCard) {
      setVirtualStartRow(0);
      setVirtualEndRow(totalPosterCardRows);
      return;
    }

    const cardsContainer = cardsContainerRef.current;
    if (!cardsContainer) {
      setVirtualStartRow(0);
      setVirtualEndRow(Math.min(totalPosterCardRows, isNarrowViewport ? 3 : 8));
      return;
    }

    const overscanRows = isNarrowViewport ? 0 : 2;

    const updateWindow = () => {
      const viewportTop = window.scrollY;
      const viewportBottom = viewportTop + window.innerHeight;
      const containerTop = cardsContainer.getBoundingClientRect().top + window.scrollY;
      const visibleTop = Math.max(0, viewportTop - containerTop);
      const visibleBottom = Math.max(0, viewportBottom - containerTop);
      const firstVisibleRow = Math.floor(visibleTop / posterCardRowStride);
      const lastVisibleRow = Math.ceil(visibleBottom / posterCardRowStride);
      const nextStart = Math.max(0, firstVisibleRow - overscanRows);
      const nextEnd = Math.min(totalPosterCardRows, Math.max(nextStart + 1, lastVisibleRow + overscanRows));
      const previousWindow = virtualWindowRef.current;
      if (previousWindow.start !== nextStart || previousWindow.end !== nextEnd) {
        virtualWindowRef.current = { start: nextStart, end: nextEnd };
        setVirtualStartRow(nextStart);
        setVirtualEndRow(nextEnd);
      }
    };

    let rafId: number | null = null;
    const queueUpdate = () => {
      if (rafId !== null) {
        return;
      }

      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updateWindow();
      });
    };

    updateWindow();
    window.addEventListener('scroll', queueUpdate, { passive: true });
    window.addEventListener('resize', queueUpdate);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener('scroll', queueUpdate);
      window.removeEventListener('resize', queueUpdate);
    };
  }, [cardsContainerRef, isNarrowViewport, posterCardRowStride, shouldVirtualizePosterCard, totalPosterCardRows]);

  const virtualizedPosterCardContent = useMemo(() => {
    if (!shouldVirtualizePosterCard) {
      return null;
    }

    const startRow = Math.max(0, Math.min(virtualStartRow, totalPosterCardRows));
    const endRow = Math.max(startRow + 1, Math.min(Math.max(virtualEndRow, 1), totalPosterCardRows));
    const startIndex = startRow * gridColumns;
    const endIndex = Math.min(filteredGames.length, endRow * gridColumns);
    const topSpacerHeight = startRow * posterCardRowStride;
    const bottomSpacerHeight = Math.max(0, (totalPosterCardRows - endRow) * posterCardRowStride);
    const content: ReactNode[] = [];

    if (topSpacerHeight > 0) {
      content.push(
        <div
          key="virtual-spacer-top"
          aria-hidden="true"
          style={{ height: `${topSpacerHeight}px`, gridColumn: '1 / -1', pointerEvents: 'none' }}
        />,
      );
    }

    for (let index = startIndex; index < endIndex; index += 1) {
      const game = filteredGames[index];
      if (!game) {
        continue;
      }

      content.push(renderGame(game));
    }

    if (bottomSpacerHeight > 0) {
      content.push(
        <div
          key="virtual-spacer-bottom"
          aria-hidden="true"
          style={{ height: `${bottomSpacerHeight}px`, gridColumn: '1 / -1', pointerEvents: 'none' }}
        />,
      );
    }

    return content;
  }, [filteredGames, gridColumns, posterCardRowStride, renderGame, shouldVirtualizePosterCard, totalPosterCardRows, virtualEndRow, virtualStartRow]);

  const posterCardDebugStats = useMemo(() => {
    if (!isPosterCardView) {
      return null;
    }

    if (!shouldVirtualizePosterCard) {
      return {
        isVirtualized: false,
        renderedCount: filteredGames.length,
        totalCount: filteredGames.length,
        startRow: 0,
        endRow: totalPosterCardRows,
        totalRows: totalPosterCardRows,
      };
    }

    const startRow = Math.max(0, Math.min(virtualStartRow, totalPosterCardRows));
    const endRow = Math.max(startRow + 1, Math.min(Math.max(virtualEndRow, 1), totalPosterCardRows));
    const startIndex = startRow * gridColumns;
    const endIndex = Math.min(filteredGames.length, endRow * gridColumns);
    return {
      isVirtualized: true,
      renderedCount: Math.max(0, endIndex - startIndex),
      totalCount: filteredGames.length,
      startRow,
      endRow,
      totalRows: totalPosterCardRows,
    };
  }, [filteredGames.length, gridColumns, isPosterCardView, shouldVirtualizePosterCard, totalPosterCardRows, virtualEndRow, virtualStartRow]);

  const totalLibraryCount = scanResult.games.length;

  return (
    <section
      className={`panel library ${detailGame ? 'library--detail' : ''} ${detailBackgroundSrc ? 'library--detail-bg' : ''}`}
      style={detailBackgroundSrc ? ({ ['--detail-bg-image' as string]: `url("${detailBackgroundSrc}")` } as CSSProperties) : undefined}
    >
      <DebugOverlayPortal
        enabled={typeof document !== 'undefined'}
        showMarker={debugFlags.showMarker}
        showVirtualizationToast={debugFlags.showVirtualizationToast}
        diagnosticsEnabled={debugFlags.diagnosticsEnabled}
        viewMode={String(viewMode)}
        visibleCount={filteredGames.length}
        totalCount={totalLibraryCount}
        isNarrowViewport={isNarrowViewport}
        forceVirtualization={debugFlags.forceVirtualization}
        posterCardDebugStats={posterCardDebugStats}
      />

      {detailGame ? renderDetailPage(detailGame) : null}

      {!detailGame ? (
        <>
          <div className="panel-heading panel-heading--library">
            <div>
              <h2>{t('library.gamesHeading')}</h2>
              <p>{scanResult.rootPath || t('library.noFolderSelected')}</p>
            </div>
            <div className="view-switcher" role="tablist" aria-label={t('library.viewModeAria')}>
              {viewModes.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`view-switcher__button ${viewMode === mode ? 'view-switcher__button--active' : ''}`}
                  aria-selected={viewMode === mode}
                  onClick={() => onChangeViewMode(mode)}
                >
                  {viewModeLabels[mode]}
                </button>
              ))}
            </div>
          </div>

          {shouldShowTopWarnings ? (
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
                className={`cards cards--${viewMode} ${isPosterCardSwitching ? 'cards--switching' : ''}`}
                ref={cardsContainerRef}
                style={{ ['--grid-columns' as string]: String(gridColumns) } as CSSProperties}
              >
                {viewMode === 'poster' || viewMode === 'card' ? (
                  isPosterCardSwitching ? (
                    Array.from({ length: skeletonCount }).map((_, index) => (
                      <article key={`skeleton-${index}`} className={`game-card game-card--${viewMode} game-card--skeleton`} aria-hidden="true">
                        <div className="game-card__art" />
                        <div className="game-card__body">
                          <div className="skeleton-line skeleton-line--title" />
                          <div className="skeleton-line" />
                          <div className="skeleton-line skeleton-line--short" />
                        </div>
                      </article>
                    ))
                  ) : (
                    virtualizedPosterCardContent ?? renderInlinePosterCardFocus()
                  )
                ) : (
                  filteredGames.map((game) => renderGame(game))
                )}
              </div>
            )}

            {!filteredGames.length ? (
              <article className="empty-state">
                <h3>{scanResult.games.length ? t('library.noSearchResultsTitle') : t('library.noGameFoldersTitle')}</h3>
                <p>
                  {scanResult.games.length
                    ? t('library.noSearchResultsBody')
                    : t('library.noGameFoldersBody')}
                </p>
              </article>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
