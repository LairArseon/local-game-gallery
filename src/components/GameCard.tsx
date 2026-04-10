/**
 * Polymorphic game card renderer for poster/card/compact/expanded modes.
 */
import type { MouseEvent, ReactNode } from 'react';
import { ArrowRight, Play } from 'lucide-react';
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
  onContextMenu,
}: GameCardProps) {
  const artImgSrc = getImageSrc(viewMode === 'poster' ? game.media.poster : game.media.card);
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

  const commonProps = {
    className: '',
    onClick: () => onToggleSelection(game.path),
    onContextMenu: (event: MouseEvent<HTMLElement>) => onContextMenu(game, event),
  };

  if (viewMode === 'compact') {
    const compactDescription = game.metadata.description.trim();
    const compactTags = game.metadata.tags.map((tag) => tag.trim()).filter(Boolean);
    return (
      <article className={`game-card game-card--compact ${isSelected ? 'game-card--selected' : ''}`} onClick={commonProps.onClick} onContextMenu={commonProps.onContextMenu}>
        <div className="game-card__row">
          <h3>{game.name}</h3>
        </div>
        <div className="game-card__compact-main">
          <div className="game-card__compact-meta">
            <p><strong>Status:</strong> {game.metadata.status || 'Not set'}</p>
            <p><strong>Score:</strong> {game.metadata.score || 'Not set'}</p>
            <p className="game-card__compact-description"><strong>Description:</strong> {compactDescription || 'No description yet.'}</p>
            <p><strong>Tags:</strong> {compactTags.length ? compactTags.join(', ') : 'None'}</p>
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
      <article className={`game-card game-card--card ${isSelected ? 'game-card--selected' : ''}`} onClick={commonProps.onClick} onContextMenu={commonProps.onContextMenu}>
        {art}
        <div className="game-card__body">
          <h3>{game.name}</h3>
          <p>Latest version: {game.metadata.latestVersion || 'Unknown'}</p>
          <p>Status: {game.metadata.status || 'Not set'}</p>
          <p>Score: {game.metadata.score || 'Not set'}</p>
          <p>Tags: {game.metadata.tags.length ? game.metadata.tags.join(', ') : 'None'}</p>
          {commonActions}
        </div>
      </article>
    );
  }

  if (viewMode === 'expanded') {
    return (
      <article className={`game-card game-card--expanded ${isSelected ? 'game-card--selected' : ''}`} onClick={commonProps.onClick} onContextMenu={commonProps.onContextMenu}>
        {art}
        <div className="game-card__body game-card__body--expanded">
          <div>
            <h3>{game.name}</h3>
            <p>Status: {game.metadata.status || 'Not set'}</p>
            <p>Score: {game.metadata.score || 'Not set'}</p>
            <p>Tags: {game.metadata.tags.length ? game.metadata.tags.join(', ') : 'None'}</p>
            <p>{game.metadata.description || 'No description yet.'}</p>
            {game.metadata.notes.filter(Boolean).slice(0, 2).map((note) => (
              <p key={note}>Note: {note}</p>
            ))}
            {bootstrapText ? <p>Bootstrapped: {bootstrapText}</p> : null}
            <ul className="version-list">
              {game.versions.map((version) => (
                <li key={version.path}>
                  <span>{version.name}</span>
                  <span>{version.hasNfo ? 'nfo' : 'no nfo'}</span>
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
    <article className={`game-card game-card--poster ${isSelected ? 'game-card--selected' : ''}`} onClick={commonProps.onClick} onContextMenu={commonProps.onContextMenu}>
      {art}
      <div className="game-card__body">
        <h3>{game.name}</h3>
        <p>Status: {game.metadata.status || 'Not set'}</p>
        <p>Score: {game.metadata.score || 'Not set'}</p>
        {commonActions}
      </div>
    </article>
  );
}
