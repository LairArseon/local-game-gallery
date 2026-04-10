/**
 * Modal for importing, reordering, and deleting game media assets.
 */
import type { Dispatch, DragEvent, SetStateAction } from 'react';
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
  if (!isOpen || !game) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal-panel modal-panel--wide" onClick={(event) => event.stopPropagation()}>
        <header className="modal-panel__header">
          <h2>Manage Pictures</h2>
          <button className="button" type="button" onClick={onClose}>Close</button>
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
                  setPendingFeaturedDropPaths(extractDroppedFilePaths(event));
                  setFeaturedImportTarget('poster');
                }}
              >
                <div className="modal-group__header">
                  <strong>Miniature and background media</strong>
                  <button className="button button--icon" type="button" onClick={() => setFeaturedImportTarget('poster')}>Add media</button>
                </div>
                {featuredImportTarget ? (
                  <div className="choice-row">
                    <button className="button button--icon" type="button" disabled={isMediaSaving} onClick={() => void onImportMedia('poster', pendingFeaturedDropPaths.length ? pendingFeaturedDropPaths : undefined)}>Poster</button>
                    <button className="button button--icon" type="button" disabled={isMediaSaving} onClick={() => void onImportMedia('card', pendingFeaturedDropPaths.length ? pendingFeaturedDropPaths : undefined)}>Card</button>
                    <button className="button button--icon" type="button" disabled={isMediaSaving} onClick={() => void onImportMedia('background', pendingFeaturedDropPaths.length ? pendingFeaturedDropPaths : undefined)}>Background</button>
                    <button className="button button--icon" type="button" onClick={() => { setFeaturedImportTarget(null); setPendingFeaturedDropPaths([]); }}>Cancel</button>
                  </div>
                ) : null}
                <div className="media-grid media-grid--featured">
                  {(['poster', 'card', 'background'] as const).map((key) => (
                    <div className="media-tile" key={key}>
                      <strong>{key}</strong>
                      {game.media[key] ? <img src={getImageSrc(game.media[key]) ?? undefined} alt={key} className="media-preview" /> : <p>No image</p>}
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
                    setDraggedScreenshotPath(null);
                    setDragOverScreenshotPath(null);
                    return;
                  }

                  void onImportMedia('screenshot', extractDroppedFilePaths(event));
                }}
              >
                <div className="modal-group__header">
                  <strong>Gallery media</strong>
                  <button className="button button--icon" type="button" disabled={isMediaSaving} onClick={() => void onImportMedia('screenshot')}>Add screenshot</button>
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
                        title="Screenshot actions"
                      >
                        ...
                      </button>
                      <img src={getImageSrc(imagePath) ?? undefined} alt="Screenshot" className="media-preview" draggable={false} />
                      <div className="media-grid__reorder">
                        <button
                          className="button button--icon"
                          type="button"
                          disabled={isMediaSaving || index === 0}
                          onClick={() => {
                            const prev = game.media.screenshots[index - 1];
                            if (prev) void onReorderScreenshots(imagePath, prev);
                          }}
                          aria-label="Move left"
                        >{'◀'}</button>
                        <button
                          className="button button--icon"
                          type="button"
                          disabled={isMediaSaving || index === game.media.screenshots.length - 1}
                          onClick={() => {
                            const next = game.media.screenshots[index + 1];
                            if (next) void onReorderScreenshots(imagePath, next);
                          }}
                          aria-label="Move right"
                        >{'▶'}</button>
                      </div>
                    </div>
                  )) : <p>No screenshots</p>}
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
            Remove screenshot
          </button>
        </div>
      ) : null}
    </div>
  );
}
