/**
 * Polymorphic game tile renderer for all gallery view variants.
 *
 * A single card implementation powers poster, card, compact, and expanded
 * layouts to avoid behavior drift between view modes. The component centralizes
 * selection, context menu entry points, and action affordances while adapting
 * its markup density per mode. This keeps interaction contracts stable even as
 * visual presentation changes.
 *
 * New to this project: this is the shared tile for all view modes; inspect mode-specific branches here, then trace emitted events to selection/play/context-menu handlers.
 */
import type { MouseEvent, ReactNode } from 'react';
import { ArrowRight, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GalleryViewMode, GameSummary } from '../types';

type GameCardProps = {
  game: GameSummary;
  viewMode: GalleryViewMode;
  isSelected: boolean;
  actionLabels: {
    play: string;
    open: string;
  };
  getImageSrc: (filePath: string | null) => string | null;
  onToggleSelection: (path: string) => void;
  onPlayClick: (game: GameSummary, event: MouseEvent<HTMLButtonElement>) => void;
  onOpenDetail: (game: GameSummary, event: MouseEvent<HTMLButtonElement>) => void;
  onResolveVersionMismatch: (game: GameSummary, event: MouseEvent<HTMLButtonElement>) => void;
  onContextMenu: (game: GameSummary, event: MouseEvent<HTMLElement>) => void;
};

export function GameCard({
  game,
  viewMode,
  isSelected,
  actionLabels,
  getImageSrc,
  onToggleSelection,
  onPlayClick,
  onOpenDetail,
  onResolveVersionMismatch,
  onContextMenu,
}: GameCardProps) {
  const { t } = useTranslation();

  const artImgSrc = getImageSrc(viewMode === 'poster' ? game.media.poster : game.media.card);
  const art = (
    <div className={`game-card__art ${game.usesPlaceholderArt ? 'game-card__art--placeholder' : ''}`}>
      {artImgSrc ? (
        <img src={artImgSrc} alt={game.name} className="media-preview media-preview--cover" />
      ) : null}
      <span>{game.usesPlaceholderArt ? t('gameView.usingPlaceholderArt') : t('gameView.imageCount', { count: game.imageCount })}</span>
    </div>
  );

  const bootstrapText = `${game.createdPicturesFolder ? 'pictures folder ' : ''}${game.createdGameNfo ? 'game.nfo ' : ''}${
    game.createdVersionNfoCount > 0 ? `${game.createdVersionNfoCount} version nfo files` : ''
  }`.trim();

  const commonActions = (
    <div className="game-card__actions">
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
  );

  const mismatchBadge = game.hasVersionMismatch ? (
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
  ) : null;

  const commonProps = {
    className: '',
    onClick: () => onToggleSelection(game.path),
    onContextMenu: (event: MouseEvent<HTMLElement>) => onContextMenu(game, event),
  };
  const versionMismatchClass = game.hasVersionMismatch ? 'game-card--version-mismatch' : '';
  const vaultedClass = game.isVaulted ? 'game-card--vaulted' : '';

  if (viewMode === 'compact') {
    const compactDescription = game.metadata.description.trim();
    const compactTags = game.metadata.tags.map((tag) => tag.trim()).filter(Boolean);
    return (
      <article className={`game-card game-card--compact ${versionMismatchClass} ${vaultedClass} ${isSelected ? 'game-card--selected' : ''}`} data-game-path={game.path} onClick={commonProps.onClick} onContextMenu={commonProps.onContextMenu}>
        <div className="game-card__row">
          <h3>{game.name}</h3>
          {mismatchBadge}
        </div>
        <div className="game-card__compact-main">
          <div className="game-card__compact-meta">
            <p><strong>{t('detail.status')}:</strong> {game.metadata.status || t('detail.notSet')}</p>
            <p><strong>{t('detail.score')}:</strong> {game.metadata.score || t('detail.notSet')}</p>
            <p className="game-card__compact-description"><strong>{t('detail.description')}:</strong> {compactDescription || t('detail.noDescription')}</p>
            <p><strong>{t('detail.tags')}:</strong> {compactTags.length ? compactTags.join(', ') : t('gameView.none')}</p>
          </div>
          <div className="game-card__actions game-card__actions--stacked">
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
        </div>
      </article>
    );
  }

  if (viewMode === 'card') {
    return (
      <article className={`game-card game-card--card ${versionMismatchClass} ${vaultedClass} ${isSelected ? 'game-card--selected' : ''}`} data-game-path={game.path} onClick={commonProps.onClick} onContextMenu={commonProps.onContextMenu}>
        {art}
        <div className="game-card__body">
          <h3>{game.name}</h3>
          {mismatchBadge}
          <p>{t('detail.latestVersion')}: {game.metadata.latestVersion || t('detail.unknown')}</p>
          <p>{t('detail.status')}: {game.metadata.status || t('detail.notSet')}</p>
          <p>{t('detail.score')}: {game.metadata.score || t('detail.notSet')}</p>
          <p>{t('detail.tags')}: {game.metadata.tags.length ? game.metadata.tags.join(', ') : t('gameView.none')}</p>
          {commonActions}
        </div>
      </article>
    );
  }

  if (viewMode === 'expanded') {
    return (
      <article className={`game-card game-card--expanded ${versionMismatchClass} ${vaultedClass} ${isSelected ? 'game-card--selected' : ''}`} data-game-path={game.path} onClick={commonProps.onClick} onContextMenu={commonProps.onContextMenu}>
        {art}
        <div className="game-card__body game-card__body--expanded">
          <div>
            <h3>{game.name}</h3>
            {mismatchBadge}
            <p>{t('detail.status')}: {game.metadata.status || t('detail.notSet')}</p>
            <p>{t('detail.score')}: {game.metadata.score || t('detail.notSet')}</p>
            <p>{t('detail.tags')}: {game.metadata.tags.length ? game.metadata.tags.join(', ') : t('gameView.none')}</p>
            <p>{game.metadata.description || t('detail.noDescription')}</p>
            {game.metadata.notes.filter(Boolean).slice(0, 2).map((note) => (
              <p key={note}>{t('gameView.note')}: {note}</p>
            ))}
            {bootstrapText ? <p>{t('gameView.bootstrapped')}: {bootstrapText}</p> : null}
            <ul className="version-list">
              {game.versions.map((version) => (
                <li key={version.path}>
                  <span>{version.name}</span>
                  <span>{version.hasNfo ? t('detail.hasNfo') : t('detail.noNfo')}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="game-card__actions game-card__actions--stacked">
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
        </div>
      </article>
    );
  }

  return (
    <article className={`game-card game-card--poster ${versionMismatchClass} ${vaultedClass} ${isSelected ? 'game-card--selected' : ''}`} data-game-path={game.path} onClick={commonProps.onClick} onContextMenu={commonProps.onContextMenu}>
      {art}
      <div className="game-card__body">
        <h3>{game.name}</h3>
        {mismatchBadge}
        <p>{t('detail.status')}: {game.metadata.status || t('detail.notSet')}</p>
        <p>{t('detail.score')}: {game.metadata.score || t('detail.notSet')}</p>
        {commonActions}
      </div>
    </article>
  );
}






