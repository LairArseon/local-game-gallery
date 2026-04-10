/**
 * Detail view for a selected game, including metadata and screenshots.
 */
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { ArrowLeft, Play } from 'lucide-react';
import type { GameSummary } from '../types';

type DetailPageProps = {
  game: GameSummary;
  contentScaleStyle: CSSProperties;
  actionLabels: {
    back: string;
    play: string;
  };
  focusCard: ReactNode;
  getImageSrc: (filePath: string | null) => string | null;
  onBack: () => void;
  onPlay: (game: GameSummary, event: MouseEvent<HTMLButtonElement>) => void;
  onOpenMetadata: (gamePath: string) => void;
  onOpenGameFolder: (gamePath: string) => void;
  onOpenVersionFolder: (versionPath: string) => void;
  onOpenVersionContextMenu: (versionPath: string, versionName: string) => void;
  onOpenPictures: (gamePath: string) => void;
  onOpenScreenshot: (imagePath: string) => void;
};

export function DetailPage({
  game,
  contentScaleStyle,
  actionLabels,
  focusCard,
  getImageSrc,
  onBack,
  onPlay,
  onOpenMetadata,
  onOpenGameFolder,
  onOpenVersionFolder,
  onOpenVersionContextMenu,
  onOpenPictures,
  onOpenScreenshot,
}: DetailPageProps) {
  return (
    <section className="detail-page" style={contentScaleStyle}>
      <header className="detail-page__header">
        <button
          className="button button--icon-only"
          type="button"
          onClick={onBack}
          aria-label={actionLabels.back}
          title={actionLabels.back}
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
        <h2>{game.name}</h2>
        <button
          className="button button--play button--icon-only"
          type="button"
          onClick={(event) => onPlay(game, event)}
          aria-label={actionLabels.play}
          title={actionLabels.play}
        >
          <Play size={16} aria-hidden="true" />
        </button>
      </header>
      {focusCard}
      <section className="detail-section panel">
        <div className="detail-section__header">
          <h3>All metadata</h3>
          <button className="button button--icon" type="button" onClick={() => onOpenMetadata(game.path)}>
            Edit metadata
          </button>
        </div>
        <div className="detail-metadata-grid">
          <div>
            <p>Latest version: {game.metadata.latestVersion || 'Unknown'}</p>
            <p>Status: {game.metadata.status || 'Not set'}</p>
            <p>Score: {game.metadata.score || 'Not set'}</p>
            <p>Description: {game.metadata.description || 'No description yet.'}</p>
            <div className="detail-tags">
              <strong>Notes</strong>
              {game.metadata.notes.filter(Boolean).map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
            {game.metadata.tags.length ? (
              <div className="detail-tags">
                <strong>Tags</strong>
                <p>{game.metadata.tags.join(', ')}</p>
              </div>
            ) : null}
            {game.metadata.customTags.length ? (
              <div className="detail-tags">
                <strong>Additional tags</strong>
                {game.metadata.customTags.map((tag) => (
                  <p key={tag.key}>{tag.key}: {tag.value}</p>
                ))}
              </div>
            ) : null}
          </div>
          <aside className="detail-versions">
            <div className="detail-versions__header">
              <strong>Versions</strong>
              <button className="button button--icon" type="button" onClick={() => onOpenGameFolder(game.path)}>
                Open game folder
              </button>
            </div>
            {game.versions.length ? (
              <ul className="detail-versions__list">
                {game.versions.map((version) => (
                  <li key={version.path}>
                    <button
                      className="detail-versions__item"
                      type="button"
                      onContextMenu={(event) => {
                        event.preventDefault();
                        onOpenVersionContextMenu(version.path, version.name);
                      }}
                      onClick={() => onOpenVersionFolder(version.path)}
                      title="Right-click for version folder actions"
                    >
                      <span>{version.name}</span>
                      <span>{version.hasNfo ? 'nfo' : 'no nfo'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No versions detected.</p>
            )}
          </aside>
        </div>
      </section>
      <section className="detail-section panel">
        <div className="detail-section__header">
          <h3>Screenshots</h3>
          <button className="button button--icon" type="button" onClick={() => onOpenPictures(game.path)}>
            Add images
          </button>
        </div>
        {game.media.screenshots.length ? (
          <div className="screenshot-grid">
            {game.media.screenshots.map((imagePath) => (
              <button
                key={imagePath}
                type="button"
                className="screenshot-grid__item"
                onClick={() => onOpenScreenshot(imagePath)}
              >
                <img src={getImageSrc(imagePath) ?? undefined} alt="Screenshot" className="media-preview" />
              </button>
            ))}
          </div>
        ) : (
          <p>No screenshots yet. Placeholder visuals are being used.</p>
        )}
      </section>
    </section>
  );
}
