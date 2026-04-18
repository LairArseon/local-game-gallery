import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

type ScanResultLike = {
  rootPath: string;
  warnings: string[];
  usingMirrorFallback: boolean;
  games: unknown[];
};

type LibraryPanelProps<TGame, TViewMode extends string, TScanResult extends ScanResultLike> = {
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

  const isPosterCardView = viewMode === 'poster' || viewMode === 'card';

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

  return (
    <section
      className={`panel library ${detailGame ? 'library--detail' : ''} ${detailBackgroundSrc ? 'library--detail-bg' : ''}`}
      style={detailBackgroundSrc ? ({ ['--detail-bg-image' as string]: `url("${detailBackgroundSrc}")` } as CSSProperties) : undefined}
    >
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
                    renderInlinePosterCardFocus()
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
