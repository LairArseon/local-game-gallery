import type { MouseEvent } from 'react';
import { ArrowRight, ListVideo, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GameDisplayLike, SharedFocusCardProps } from '../types/gameDisplayTypes';
import { formatByteSize, formatLastPlayed } from '../utils/app-helpers';

function renderFocusFact(label: string, value: string) {
  return (
    <div className="focus-card__fact" key={label}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

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
  extraContent,
}: SharedFocusCardProps<TGame>) {
  const { t } = useTranslation();
  const latestVersion = game.metadata.latestVersion || t('detail.unknown');
  const status = game.metadata.status || t('detail.notSet');
  const score = game.metadata.score || t('detail.notSet');
  const size = game.sizeBytes === null ? t('app.calculating') : formatByteSize(game.sizeBytes);
  const lastPlayed = formatLastPlayedValue(game.lastPlayedAt);
  const description = game.metadata.description.trim() || t('detail.noDescription');
  const notePreview = game.metadata.notes.filter(Boolean).slice(0, 2);
  const tagPreview = game.metadata.tags.filter(Boolean);

  const hasScreenshotCarousel = game.media.screenshots.length > 0;
  const normalizedCarouselIndex = hasScreenshotCarousel
    ? ((carouselIndex % game.media.screenshots.length) + game.media.screenshots.length) % game.media.screenshots.length
    : 0;
  const focusImgSrc = hasScreenshotCarousel
    ? getImageSrc(game.media.screenshots[normalizedCarouselIndex] ?? null, 'mediumPreview')
    : isVertical
      ? getImageSrc(game.media.poster ?? game.media.card, 'mediumPreview')
      : getImageSrc(game.media.card ?? game.media.poster, 'mediumPreview');
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
            <img src={focusImgSrc} alt={game.name} className="media-preview media-preview--cover" loading="lazy" decoding="async" />
          </button>
        ) : focusImgSrc ? (
          <img src={focusImgSrc} alt={game.name} className="media-preview media-preview--cover" loading="lazy" decoding="async" />
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
        <header className="focus-card__header">
          <div className="focus-card__heading">
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
            <h3>{game.name}</h3>
          </div>
          {showActions ? (
            <div className="focus-card__actions">
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
        </header>
        <dl className="focus-card__fact-grid">
          {renderFocusFact(t('detail.latestVersion'), latestVersion)}
          {renderFocusFact(t('detail.status'), status)}
          {renderFocusFact(t('detail.score'), score)}
          {renderFocusFact(t('gameView.size'), size)}
          {renderFocusFact(t('gameView.lastPlayed'), lastPlayed)}
        </dl>
        <div className="focus-card__section-grid">
          <section className="focus-card__section focus-card__section--primary">
            <div className="focus-card__section-header">
              <strong>{t('detail.description')}</strong>
            </div>
            <p className="focus-card__description">{description}</p>
          </section>
          {notePreview.length || tagPreview.length ? (
            <div className="focus-card__supporting">
              {notePreview.length ? (
                <section className="focus-card__section focus-card__section--secondary">
                  <div className="focus-card__section-header">
                    <strong>{t('detail.notes')}</strong>
                  </div>
                  <ul className="focus-card__note-list">
                    {notePreview.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {tagPreview.length ? (
                <section className="focus-card__section focus-card__section--secondary">
                  <div className="focus-card__section-header">
                    <strong>{t('detail.tags')}</strong>
                  </div>
                  <div className="focus-card__tag-list">
                    {tagPreview.map((tag) => <span key={tag} className="focus-card__tag">{tag}</span>)}
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
        {extraContent ? <div className="focus-card__extra">{extraContent}</div> : null}
      </div>
    </article>
  );
}
