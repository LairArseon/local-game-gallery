import { Fragment, useCallback, type Dispatch, type MouseEvent, type SetStateAction } from 'react';
import { FocusCard } from '../components/FocusCard';
import { GameCard } from '../components/GameCard';
import type { GalleryViewMode, GameSummary } from '../types';
import { formatLastPlayed } from '../utils/app-helpers';

type ActionLabels = {
  play: string;
  playByVersion: string;
  open: string;
};

type UseGalleryRenderersArgs = {
  viewMode: GalleryViewMode;
  isNarrowViewport: boolean;
  enableInlineFocus: boolean;
  selectedGamePath: string | null;
  filteredGames: GameSummary[];
  gridColumns: number;
  canLaunch: boolean;
  actionLabels: ActionLabels;
  getImageSrc: (filePath: string | null) => string | null;
  onToggleSelection: (path: string) => void;
  onPlayClick: (game: GameSummary, event: MouseEvent<HTMLButtonElement>) => void;
  onPlayWithVersionPromptClick: (game: GameSummary, event: MouseEvent<HTMLButtonElement>) => void;
  onOpenDetail: (game: GameSummary, event: MouseEvent<HTMLButtonElement>) => void;
  onResolveVersionMismatch: (game: GameSummary, event: MouseEvent<HTMLButtonElement>) => void;
  onGameCardContextMenu: (targetGame: GameSummary, event: MouseEvent<HTMLElement>) => void;
  focusCarouselIndexByGamePath: Record<string, number>;
  setFocusCarouselIndexByGamePath: Dispatch<SetStateAction<Record<string, number>>>;
  setScreenshotModalPath: Dispatch<SetStateAction<string | null>>;
};

export function useGalleryRenderers({
  viewMode,
  isNarrowViewport,
  enableInlineFocus,
  selectedGamePath,
  filteredGames,
  gridColumns,
  canLaunch,
  actionLabels,
  getImageSrc,
  onToggleSelection,
  onPlayClick,
  onPlayWithVersionPromptClick,
  onOpenDetail,
  onResolveVersionMismatch,
  onGameCardContextMenu,
  focusCarouselIndexByGamePath,
  setFocusCarouselIndexByGamePath,
  setScreenshotModalPath,
}: UseGalleryRenderersArgs) {
  const renderFocusCard = useCallback((game: GameSummary, isVertical: boolean, showActions = true) => {
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
        canLaunch={canLaunch}
        carouselIndex={carouselIndex}
        getImageSrc={getImageSrc}
        onMoveCarousel={moveFocusCarousel}
        onOpenScreenshot={setScreenshotModalPath}
        onPlayClick={onPlayClick}
        onPlayWithVersionPromptClick={onPlayWithVersionPromptClick}
        onOpenDetail={onOpenDetail}
        onResolveVersionMismatch={onResolveVersionMismatch}
        actionLabels={actionLabels}
        formatLastPlayedValue={formatLastPlayed}
      />
    );
  }, [actionLabels, canLaunch, focusCarouselIndexByGamePath, getImageSrc, onOpenDetail, onPlayClick, onPlayWithVersionPromptClick, onResolveVersionMismatch, setFocusCarouselIndexByGamePath, setScreenshotModalPath]);

  const renderGame = useCallback((game: GameSummary) => {
    return (
      <GameCard
        key={game.path}
        game={game}
        viewMode={viewMode}
        isSelected={!isNarrowViewport && selectedGamePath === game.path}
        isNarrowViewport={isNarrowViewport}
        canLaunch={canLaunch}
        actionLabels={actionLabels}
        getImageSrc={getImageSrc}
        onToggleSelection={onToggleSelection}
        onPlayClick={onPlayClick}
        onOpenDetail={onOpenDetail}
        onResolveVersionMismatch={onResolveVersionMismatch}
        onContextMenu={onGameCardContextMenu}
      />
    );
  }, [actionLabels, canLaunch, getImageSrc, isNarrowViewport, onGameCardContextMenu, onOpenDetail, onPlayClick, onResolveVersionMismatch, onToggleSelection, selectedGamePath, viewMode]);

  const renderInlinePosterCardFocus = useCallback(() => {
    if (!enableInlineFocus) {
      return filteredGames.map((game) => renderGame(game));
    }

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
  }, [enableInlineFocus, filteredGames, gridColumns, renderFocusCard, renderGame, selectedGamePath]);

  return {
    renderFocusCard,
    renderGame,
    renderInlinePosterCardFocus,
  };
}
