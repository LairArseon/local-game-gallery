/**
 * Full detail workspace for a selected game.
 *
 * This view composes metadata, version actions, media shortcuts, and the focus
 * card into a single drill-down surface. It is intentionally action-heavy so
 * users can play, edit, browse folders, and inspect screenshots without leaving
 * the current context. Callback props keep side effects in hooks/App while this
 * file remains focused on rendering and interaction layout.
 */
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { ArrowLeft, ListVideo, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GameSummary } from '../types';

type DetailPageProps = {
  game: GameSummary;
  contentScaleStyle: CSSProperties;
  actionLabels: {
    back: string;
    play: string;
    playByVersion: string;
  };
  focusCard: ReactNode;
  getImageSrc: (filePath: string | null) => string | null;
  onBack: () => void;
  onPlay: (game: GameSummary, event: MouseEvent<HTMLButtonElement>) => void;
  onPlayWithVersionPrompt: (game: GameSummary, event: MouseEvent<HTMLButtonElement>) => void;
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
  onPlayWithVersionPrompt,
}: DetailPageProps) {
  const { t } = useTranslation();

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
        {game.versions.length > 1 ? (
          <button
            className="button button--play-version button--icon-only"
            type="button"
            onClick={(event) => onPlayWithVersionPrompt(game, event)}
            aria-label={actionLabels.playByVersion}
            title={actionLabels.playByVersion}
          >
            <ListVideo size={16} aria-hidden="true" />
          </button>
        ) : null}
      </header>
      {focusCard}
      <section className="detail-section panel">
        <div className="detail-section__header">
          <h3>{t('detail.allMetadata')}</h3>
          <button className="button button--icon" type="button" onClick={() => onOpenMetadata(game.path)}>
            {t('detail.editMetadata')}
          </button>
        </div>
        <div className="detail-metadata-grid">
          <div>
            <p>{t('detail.latestVersion')}: {game.metadata.latestVersion || t('detail.unknown')}</p>
            <p>{t('detail.status')}: {game.metadata.status || t('detail.notSet')}</p>
            <p>{t('detail.score')}: {game.metadata.score || t('detail.notSet')}</p>
            <p>{t('detail.description')}: {game.metadata.description || t('detail.noDescription')}</p>
            <div className="detail-tags">
              <strong>{t('detail.notes')}</strong>
              {game.metadata.notes.filter(Boolean).map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
            {game.metadata.tags.length ? (
              <div className="detail-tags">
                <strong>{t('detail.tags')}</strong>
                <p>{game.metadata.tags.join(', ')}</p>
              </div>
            ) : null}
            {game.metadata.customTags.length ? (
              <div className="detail-tags">
                <strong>{t('detail.additionalTags')}</strong>
                {game.metadata.customTags.map((tag) => (
                  <p key={tag.key}>{tag.key}: {tag.value}</p>
                ))}
              </div>
            ) : null}
          </div>
          <aside className="detail-versions">
            <div className="detail-versions__header">
              <strong>{t('detail.versions')}</strong>
              <button className="button button--icon" type="button" onClick={() => onOpenGameFolder(game.path)}>
                {t('detail.openGameFolder')}
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
                        // Right-click opens Electron menu with version-specific actions.
                        onOpenVersionContextMenu(version.path, version.name);
                      }}
                      onClick={() => onOpenVersionFolder(version.path)}
                      title={t('detail.versionActionsHint')}
                    >
                      <span>{version.name}</span>
                      <span>{version.hasNfo ? t('detail.hasNfo') : t('detail.noNfo')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t('detail.noVersions')}</p>
            )}
          </aside>
        </div>
      </section>
      <section className="detail-section panel">
        <div className="detail-section__header">
          <h3>{t('detail.screenshots')}</h3>
          <button className="button button--icon" type="button" onClick={() => onOpenPictures(game.path)}>
            {t('detail.addImages')}
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
          <p>{t('detail.noScreenshots')}</p>
        )}
      </section>
    </section>
  );
}
