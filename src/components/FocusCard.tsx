/**
 * Rich game spotlight card used in side panes and detail experiences.
 *
 * This component prioritizes high-signal metadata while supporting screenshot
 * carousel navigation and quick actions. It gracefully falls back between media
 * types when screenshots are unavailable and exposes compact controls for play
 * and open-detail flows. The same card is reused in multiple layouts so the
 * information hierarchy stays consistent across view modes.
 */
import type { MouseEvent } from 'react';
import { ArrowRight, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

  const hasScreenshotCarousel = game.media.screenshots.length > 0;
  // Normalize to a positive modulo so prev/next wrapping works with negative deltas.
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
              aria-label={t('gameView.previousScreenshot')}
            >
              {t('gameView.prev')}
            </button>
            <span>{normalizedCarouselIndex + 1}/{game.media.screenshots.length}</span>
            <button
              className="button button--icon"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onMoveCarousel(1);
              }}
              aria-label={t('gameView.nextScreenshot')}
            >
              {t('gameView.next')}
            </button>
          </div>
        ) : null}
        <span>{game.usesPlaceholderArt ? t('gameView.usingPlaceholderArt') : t('gameView.imageCount', { count: game.imageCount })}</span>
      </div>
      <div className="focus-card__content">
        <h3>{game.name}</h3>
        <p>{t('detail.latestVersion')}: {game.metadata.latestVersion || t('detail.unknown')}</p>
        <p>{t('detail.status')}: {game.metadata.status || t('detail.notSet')}</p>
        <p>{t('detail.score')}: {game.metadata.score || t('detail.notSet')}</p>
        <p>{t('gameView.lastPlayed')}: {formatLastPlayed(game.lastPlayedAt)}</p>
        <p>{game.metadata.description || t('detail.noDescription')}</p>
        {game.metadata.notes.filter(Boolean).slice(0, 2).map((note) => (
          <p key={note}>{t('gameView.note')}: {note}</p>
        ))}
        {game.metadata.tags.length ? <p>{t('detail.tags')}: {game.metadata.tags.join(', ')}</p> : null}
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
