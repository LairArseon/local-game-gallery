/**
 * Expanded focus card used in side panels and detail contexts.
 */
import type { MouseEvent } from 'react';
import { ArrowRight, Play } from 'lucide-react';
import type { GameSummary } from '../types';
import { formatLastPlayed } from '../utils/app-helpers';

type FocusCardProps = {
  game: GameSummary;
  isVertical: boolean;
  showActions?: boolean;
  carouselIndex: number;
  getImageSrc: (filePath: string | null) => string | null;
  onMoveCarousel: (delta: number) => void;
  onOpenScreenshot: (imagePath: string) => void;
  onPlayClick: (game: GameSummary, event: MouseEvent<HTMLButtonElement>) => void;
  onOpenDetail: (game: GameSummary, event: MouseEvent<HTMLButtonElement>) => void;
  actionLabels: {
    play: string;
    open: string;
  };
};

export function FocusCard({
  game,
  isVertical,
  showActions = true,
  carouselIndex,
  getImageSrc,
  onMoveCarousel,
  onOpenScreenshot,
  onPlayClick,
  onOpenDetail,
  actionLabels,
}: FocusCardProps) {
  const hasScreenshotCarousel = game.media.screenshots.length > 0;
  const normalizedCarouselIndex = hasScreenshotCarousel
    ? ((carouselIndex % game.media.screenshots.length) + game.media.screenshots.length) % game.media.screenshots.length
    : 0;
  const focusImgSrc = hasScreenshotCarousel
    ? getImageSrc(game.media.screenshots[normalizedCarouselIndex] ?? null)
    : isVertical
      ? getImageSrc(game.media.poster ?? game.media.card)
      : getImageSrc(game.media.card ?? game.media.poster);
  const currentCarouselImagePath = hasScreenshotCarousel
    ? game.media.screenshots[normalizedCarouselIndex] ?? null
    : null;

  return (
    <article className={`focus-card panel ${isVertical ? 'focus-card--vertical' : 'focus-card--wide'}`}>
      <div className={`game-card__art ${game.usesPlaceholderArt ? 'game-card__art--placeholder' : ''}`}>
        {hasScreenshotCarousel && focusImgSrc && currentCarouselImagePath ? (
          <button
            type="button"
            className="focus-carousel-image-button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenScreenshot(currentCarouselImagePath);
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
                onMoveCarousel(-1);
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
                onMoveCarousel(1);
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
              onClick={(event) => onPlayClick(game, event)}
              aria-label={actionLabels.play}
              title={actionLabels.play}
            >
              <Play size={16} aria-hidden="true" />
            </button>
            <button
              className="button button--icon button--icon-only"
              type="button"
              onClick={(event) => onOpenDetail(game, event)}
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
