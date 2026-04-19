import type { MouseEvent } from 'react';
import { ArrowRight, ListVideo, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GameDisplayLike, SharedFocusCardProps } from '../types/gameDisplayTypes';
import { formatByteSize, formatLastPlayed } from '../utils/app-helpers';

export function FocusCard<TGame extends GameDisplayLike>({
  game,
  isVertical,
  showActions = true,
  canLaunch,
  carouselIndex,
  getImageSrc,
  onMoveCarousel,
  onOpenScreenshot,
  onPlayClick,
  onPlayWithVersionPromptClick,
  onOpenDetail,
  onResolveVersionMismatch,
  actionLabels,
  formatLastPlayedValue = formatLastPlayed,
}: SharedFocusCardProps<TGame>) {
  const { t } = useTranslation();

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
    <article className={`focus-card panel ${game.hasVersionMismatch ? 'focus-card--version-mismatch' : ''} ${game.isVaulted ? 'focus-card--vaulted' : ''} ${isVertical ? 'focus-card--vertical' : 'focus-card--wide'}`}>
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
        {game.hasVersionMismatch ? (
          <button
            className="version-mismatch-badge"
            type="button"
            onClick={(event) => onResolveVersionMismatch(game, event)}
            title={t('versionMismatch.resolveTooltip')}
            aria-label={t('versionMismatch.badgeAria', {
              current: game.metadata.latestVersion || t('detail.unknown'),
              detected: game.detectedLatestVersion || t('detail.unknown'),
            })}
          >
            <span className="version-mismatch-badge__label">{t('versionMismatch.badgeLabelPrefix')}</span>
            <span className="version-mismatch-badge__delta">
              {t('versionMismatch.badgeLabelDelta', {
                current: game.metadata.latestVersion || t('detail.unknown'),
                detected: game.detectedLatestVersion || t('detail.unknown'),
              })}
            </span>
          </button>
        ) : null}
        <p>{t('detail.latestVersion')}: {game.metadata.latestVersion || t('detail.unknown')}</p>
        <p>{t('detail.status')}: {game.metadata.status || t('detail.notSet')}</p>
        <p>{t('detail.score')}: {game.metadata.score || t('detail.notSet')}</p>
        <p>{t('gameView.size')}: {game.sizeBytes === null ? t('app.calculating') : formatByteSize(game.sizeBytes)}</p>
        <p>{t('gameView.lastPlayed')}: {formatLastPlayedValue(game.lastPlayedAt)}</p>
        <p>{game.metadata.description || t('detail.noDescription')}</p>
        {game.metadata.notes.filter(Boolean).slice(0, 2).map((note) => (
          <p key={note}>{t('gameView.note')}: {note}</p>
        ))}
        {game.metadata.tags.length ? <p>{t('detail.tags')}: {game.metadata.tags.join(', ')}</p> : null}
        {showActions ? (
          <div className="game-card__actions game-card__actions--floating">
            {canLaunch ? (
              <button
                className="button button--play button--icon button--icon-only"
                type="button"
                onClick={(event) => onPlayClick(game, event)}
                aria-label={actionLabels.play}
                title={actionLabels.play}
              >
                <Play size={16} aria-hidden="true" />
              </button>
            ) : null}
            {canLaunch && game.versions.length > 1 ? (
              <button
                className="button button--play-version button--icon button--icon-only"
                type="button"
                onClick={(event) => onPlayWithVersionPromptClick(game, event)}
                aria-label={actionLabels.playByVersion}
                title={actionLabels.playByVersion}
              >
                <ListVideo size={16} aria-hidden="true" />
              </button>
            ) : null}
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
