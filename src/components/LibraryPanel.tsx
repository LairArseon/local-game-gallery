/**
 * Main library surface that switches between browsing and detail states.
 *
 * This component owns the structural shell of the right-side content area:
 * detail page mode, gallery/list mode, warning banners, and empty-state copy.
 * It receives renderer callbacks so heavy list/detail presentation logic can be
 * reused while App remains an orchestrator. Special behavior includes dynamic
 * card grid wiring and view-mode switch controls.
 */
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { DetailPage } from './DetailPage';
import type { GalleryViewMode, GameSummary, ScanResult } from '../types';

const galleryViewModes: GalleryViewMode[] = ['poster', 'card', 'compact', 'expanded'];

type LibraryPanelProps = {
  detailGame: GameSummary | null;
  detailBackgroundSrc: string | null;
  contentScaleStyle: CSSProperties;
  actionLabels: {
    back: string;
    play: string;
  };
  renderFocusCard: (game: GameSummary, isVertical: boolean, showActions?: boolean) => ReactNode;
  getImageSrc: (filePath: string | null) => string | null;
  onBackFromDetail: () => void;
  onPlay: (game: GameSummary, event: React.MouseEvent<HTMLButtonElement>) => void;
  onOpenMetadata: (gamePath: string) => void;
  onOpenGameFolder: (gamePath: string) => void;
  onOpenVersionFolder: (versionPath: string) => void;
  onOpenVersionContextMenu: (versionPath: string, versionName: string) => void;
  onOpenPictures: (gamePath: string) => void;
  onOpenScreenshot: (imagePath: string) => void;
  scanResult: ScanResult;
  viewMode: GalleryViewMode;
  viewModeLabels: Record<GalleryViewMode, string>;
  onChangeViewMode: (mode: GalleryViewMode) => void;
  filteredGames: GameSummary[];
  selectedGame: GameSummary | null;
  cardsContainerRef: RefObject<HTMLDivElement | null>;
  gridColumns: number;
  renderInlinePosterCardFocus: () => ReactNode;
  renderGame: (game: GameSummary) => ReactNode;
};

export function LibraryPanel({
  detailGame,
  detailBackgroundSrc,
  contentScaleStyle,
  actionLabels,
  renderFocusCard,
  getImageSrc,
  onBackFromDetail,
  onPlay,
  onOpenMetadata,
  onOpenGameFolder,
  onOpenVersionFolder,
  onOpenVersionContextMenu,
  onOpenPictures,
  onOpenScreenshot,
  scanResult,
  viewMode,
  viewModeLabels,
  onChangeViewMode,
  filteredGames,
  selectedGame,
  cardsContainerRef,
  gridColumns,
  renderInlinePosterCardFocus,
  renderGame,
}: LibraryPanelProps) {
  const { t } = useTranslation();

  return (
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
          getImageSrc={getImageSrc}
          onBack={onBackFromDetail}
          onPlay={onPlay}
          onOpenMetadata={onOpenMetadata}
          onOpenGameFolder={onOpenGameFolder}
          onOpenVersionFolder={onOpenVersionFolder}
          onOpenVersionContextMenu={onOpenVersionContextMenu}
          onOpenPictures={onOpenPictures}
          onOpenScreenshot={onOpenScreenshot}
        />
      ) : null}

      {!detailGame ? (
        <>
          <div className="panel-heading panel-heading--library">
            <div>
              <h2>{t('library.gamesHeading')}</h2>
              <p>{scanResult.rootPath || t('library.noFolderSelected')}</p>
            </div>
            <div className="view-switcher" role="tablist" aria-label={t('library.viewModeAria')}>
              {galleryViewModes.map((mode) => (
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
                {viewMode === 'poster' || viewMode === 'card'
                  ? renderInlinePosterCardFocus()
                  : filteredGames.map((game) => renderGame(game))}
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
