/**
 * Media management modal for featured art and screenshot gallery operations.
 *
 * This overlay coordinates several high-friction workflows in one place:
 * importing via dialog or drop, drag-reordering screenshots, and quick delete
 * actions through a contextual menu. It also preserves local drag intent state
 * so interactions feel predictable while async media updates are pending.
 */
import type { Dispatch, DragEvent, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameSummary } from '../types';

type FeaturedTarget = 'poster' | 'card' | 'background' | null;
type DragSection = 'featured' | 'gallery' | null;
type ScreenshotContextMenu = { x: number; y: number; imagePath: string } | null;

type MediaModalProps = {
  game: GameSummary | null;
  isOpen: boolean;
  isMediaSaving: boolean;
  featuredImportTarget: FeaturedTarget;
  pendingFeaturedDropPaths: string[];
  dragSection: DragSection;
  draggedScreenshotPath: string | null;
  dragOverScreenshotPath: string | null;
  screenshotContextMenu: ScreenshotContextMenu;
  getImageSrc: (filePath: string | null) => string | null;
  setFeaturedImportTarget: Dispatch<SetStateAction<FeaturedTarget>>;
  setPendingFeaturedDropPaths: Dispatch<SetStateAction<string[]>>;
  setDragSection: Dispatch<SetStateAction<DragSection>>;
  setDraggedScreenshotPath: Dispatch<SetStateAction<string | null>>;
  setDragOverScreenshotPath: Dispatch<SetStateAction<string | null>>;
  setScreenshotContextMenu: Dispatch<SetStateAction<ScreenshotContextMenu>>;
  onClose: () => void;
  onImportMedia: (target: 'poster' | 'card' | 'background' | 'screenshot', filePaths?: string[]) => Promise<void>;
  onReorderScreenshots: (fromPath: string, toPath: string) => Promise<void>;
  onRemoveScreenshot: (imagePath: string) => Promise<void>;
};

function extractDroppedFilePaths(event: DragEvent<HTMLElement>) {
  // Electron exposes absolute paths on dropped files; keep only valid path entries.
  return Array.from(event.dataTransfer.files)
    .map((file) => file.path)
    .filter(Boolean);
}

function extractDraggedScreenshotPath(event: DragEvent<HTMLElement>) {
  return event.dataTransfer.getData('application/x-local-gallery-screenshot') || event.dataTransfer.getData('text/plain');
}

export function MediaModal({
  game,
  isOpen,
  isMediaSaving,
  featuredImportTarget,
  pendingFeaturedDropPaths,
  dragSection,
  draggedScreenshotPath,
  dragOverScreenshotPath,
  screenshotContextMenu,
  getImageSrc,
  setFeaturedImportTarget,
  setPendingFeaturedDropPaths,
  setDragSection,
  setDraggedScreenshotPath,
  setDragOverScreenshotPath,
  setScreenshotContextMenu,
  onClose,
  onImportMedia,
  onReorderScreenshots,
  onRemoveScreenshot,
}: MediaModalProps) {
  const { t } = useTranslation();

  if (!isOpen || !game) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal-panel modal-panel--wide" onClick={(event) => event.stopPropagation()}>
        <header className="modal-panel__header">
          <h2>{t('media.managePictures')}</h2>
          <button className="button" type="button" onClick={onClose}>{t('common.close')}</button>
        </header>
        <div className="modal-panel__body">
          <>
              <section
                className={`media-section ${dragSection === 'featured' ? 'media-section--drag' : ''}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragSection('featured');
                }}
                onDragLeave={() => setDragSection((current) => current === 'featured' ? null : current)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragSection(null);
                  // Drop in featured area stages files and asks user to choose poster/card/background target.
                  setPendingFeaturedDropPaths(extractDroppedFilePaths(event));
                  setFeaturedImportTarget('poster');
                }}
              >
                <div className="modal-group__header">
                  <strong>{t('media.featuredMedia')}</strong>
                  <button className="button button--icon" type="button" onClick={() => setFeaturedImportTarget('poster')}>{t('media.addMedia')}</button>
                </div>
                {featuredImportTarget ? (
                  <div className="choice-row">
                    <button className="button button--icon" type="button" disabled={isMediaSaving} onClick={() => void onImportMedia('poster', pendingFeaturedDropPaths.length ? pendingFeaturedDropPaths : undefined)}>{t('viewMode.poster')}</button>
                    <button className="button button--icon" type="button" disabled={isMediaSaving} onClick={() => void onImportMedia('card', pendingFeaturedDropPaths.length ? pendingFeaturedDropPaths : undefined)}>{t('viewMode.card')}</button>
                    <button className="button button--icon" type="button" disabled={isMediaSaving} onClick={() => void onImportMedia('background', pendingFeaturedDropPaths.length ? pendingFeaturedDropPaths : undefined)}>{t('media.background')}</button>
                    <button className="button button--icon" type="button" onClick={() => { setFeaturedImportTarget(null); setPendingFeaturedDropPaths([]); }}>{t('common.cancel')}</button>
                  </div>
                ) : null}
                <div className="media-grid media-grid--featured">
                  {(['poster', 'card', 'background'] as const).map((key) => (
                    <div className="media-tile" key={key}>
                      <strong>{key === 'background' ? t('media.background') : t(`viewMode.${key}`)}</strong>
                      {game.media[key] ? <img src={getImageSrc(game.media[key]) ?? undefined} alt={key === 'background' ? t('media.background') : t(`viewMode.${key}`)} className="media-preview" /> : <p>{t('media.noImage')}</p>}
                    </div>
                  ))}
                </div>
              </section>

              <hr className="media-separator" />

              <section
                className={`media-section ${dragSection === 'gallery' ? 'media-section--drag' : ''}`}
                onDragOver={(event) => {
                  if (draggedScreenshotPath) {
                    event.preventDefault();
                    return;
                  }

                  const dragTypes = Array.from(event.dataTransfer.types);
                  if (!dragTypes.includes('Files')) {
                    return;
                  }

                  event.preventDefault();
                  setDragSection('gallery');
                }}
                onDragLeave={() => setDragSection((current) => current === 'gallery' ? null : current)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragSection(null);
                  if (draggedScreenshotPath) {
                    // This drop is part of reorder flow, not file import.
                    setDraggedScreenshotPath(null);
                    setDragOverScreenshotPath(null);
                    return;
                  }

                  void onImportMedia('screenshot', extractDroppedFilePaths(event));
                }}
              >
                <div className="modal-group__header">
                  <strong>{t('media.galleryMedia')}</strong>
                  <button className="button button--icon" type="button" disabled={isMediaSaving} onClick={() => void onImportMedia('screenshot')}>{t('media.addScreenshot')}</button>
                </div>
                <div className="media-grid">
                  {game.media.screenshots.length ? game.media.screenshots.map((imagePath, index) => (
                    <div
                      key={imagePath}
                      className={`media-grid__item ${draggedScreenshotPath === imagePath ? 'media-grid__item--dragging' : ''} ${dragOverScreenshotPath === imagePath ? 'media-grid__item--drop-target' : ''}`}
                      draggable={!isMediaSaving}
                      onDragStart={(event) => {
                        setScreenshotContextMenu(null);
                        setDragSection(null);
                        setDraggedScreenshotPath(imagePath);
                        setDragOverScreenshotPath(null);
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('application/x-local-gallery-screenshot', imagePath);
                        event.dataTransfer.setData('text/plain', imagePath);
                      }}
                      onDragEnd={() => {
                        setDraggedScreenshotPath(null);
                        setDragOverScreenshotPath(null);
                      }}
                      onDragOver={(event) => {
                        if (!draggedScreenshotPath || draggedScreenshotPath === imagePath) {
                          return;
                        }

                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                      }}
                      onDragEnter={() => {
                        if (!draggedScreenshotPath || draggedScreenshotPath === imagePath) {
                          return;
                        }

                        setDragOverScreenshotPath(imagePath);
                      }}
                      onDragLeave={() => {
                        setDragOverScreenshotPath((current) => current === imagePath ? null : current);
                      }}
                      onDrop={(event) => {
                        const fromPath = draggedScreenshotPath || extractDraggedScreenshotPath(event);
                        event.preventDefault();
                        event.stopPropagation();
                        setDraggedScreenshotPath(null);
                        setDragOverScreenshotPath(null);
                        // Ignore no-op drops (same source/target) to avoid redundant reorder IPC calls.
                        if (!fromPath || fromPath === imagePath) {
                          return;
                        }

                        void onReorderScreenshots(fromPath, imagePath);
                      }}
                    >
                      <button
                        type="button"
                        className="media-grid__drag-handle"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (isMediaSaving) {
                            return;
                          }

                          const rect = event.currentTarget.getBoundingClientRect();
                          setScreenshotContextMenu({
                            x: Math.round(rect.left),
                            y: Math.round(rect.bottom + 6),
                            imagePath,
                          });
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (isMediaSaving) {
                            return;
                          }

                          setScreenshotContextMenu({
                            x: event.clientX,
                            y: event.clientY,
                            imagePath,
                          });
                        }}
                        title={t('media.screenshotActions')}
                      >
                        ...
                      </button>
                      <img src={getImageSrc(imagePath) ?? undefined} alt={t('media.screenshotAlt')} className="media-preview" draggable={false} />
                      <div className="media-grid__reorder">
                        <button
                          className="button button--icon"
                          type="button"
                          disabled={isMediaSaving || index === 0}
                          onClick={() => {
                            const prev = game.media.screenshots[index - 1];
                            if (prev) void onReorderScreenshots(imagePath, prev);
                          }}
                          aria-label={t('media.moveLeft')}
                        >{'◀'}</button>
                        <button
                          className="button button--icon"
                          type="button"
                          disabled={isMediaSaving || index === game.media.screenshots.length - 1}
                          onClick={() => {
                            const next = game.media.screenshots[index + 1];
                            if (next) void onReorderScreenshots(imagePath, next);
                          }}
                          aria-label={t('media.moveRight')}
                        >{'▶'}</button>
                      </div>
                    </div>
                  )) : <p>{t('media.noScreenshots')}</p>}
                </div>
              </section>
          </>
        </div>
      </section>
      {screenshotContextMenu ? (
        <div
          className="context-menu"
          style={{ left: screenshotContextMenu.x, top: screenshotContextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            className="context-menu__item context-menu__item--danger"
            type="button"
            onClick={() => {
              void onRemoveScreenshot(screenshotContextMenu.imagePath);
            }}
          >
            {t('media.removeScreenshot')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
