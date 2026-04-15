/**
 * Centralized overlay host for all app modal surfaces.
 *
 * This component keeps modal composition out of App by wiring metadata, media,
 * log viewer, and screenshot lightbox overlays in one place. It preserves each
 * modal's existing callback contracts and orchestrates conditional rendering so
 * App stays focused on state orchestration rather than modal markup volume.
 *
 * New to this project: this is the modal switchboard; use it to see which state flag opens each modal and which hook owns each modal's behavior.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LogViewerModal } from './LogViewerModal';
import { MediaModal } from './MediaModal';
import { MetadataModal } from './MetadataModal';
import { VaultPinModal } from './VaultPinModal';
import { VaultUnlockModal } from './VaultUnlockModal';
import type { GameMetadata, GameSummary } from '../types';
import type { BrowserMediaUploadProgress } from '../client/adapters/webClient';

type TagAutocompleteState = {
  scope: 'pool' | 'filter' | 'metadata';
  index: number;
  highlighted: number;
} | null;

type ModalHostProps = {
  games: GameSummary[];
  isMirrorSyncConfirmOpen: boolean;
  onConfirmMirrorSync: () => void;
  onCancelMirrorSync: () => void;
  isMirrorParityConfirmOpen: boolean;
  onConfirmMirrorParitySync: () => void;
  onCancelMirrorParitySync: () => void;
  metadataModalGamePath: string | null;
  metadataDraft: GameMetadata | null;
  statusChoices: string[];
  activeMetadataTagEditorIndex: number | null;
  activeTagAutocomplete: TagAutocompleteState;
  activeTagSuggestions: string[];
  isMetadataSaving: boolean;
  closeMetadataModal: () => void;
  saveMetadataChanges: () => Promise<unknown>;
  setMetadataDraft: Dispatch<SetStateAction<GameMetadata | null>>;
  setActiveMetadataTagEditorIndex: Dispatch<SetStateAction<number | null>>;
  setActiveTagAutocomplete: Dispatch<SetStateAction<TagAutocompleteState>>;
  handleTagAutocompleteKeyDown: (
    event: React.KeyboardEvent<HTMLInputElement>,
    scope: 'pool' | 'filter' | 'metadata',
    index: number,
  ) => void;
  applyTagSuggestion: (scope: 'pool' | 'filter' | 'metadata', index: number, suggestion: string) => void;
  mediaModalGame: GameSummary | null;
  mediaModalGamePath: string | null;
  isMediaSaving: boolean;
  mediaUploadProgress: BrowserMediaUploadProgress | null;
  featuredImportTarget: 'poster' | 'card' | 'background' | null;
  pendingFeaturedDropPaths: string[];
  dragSection: 'featured' | 'gallery' | null;
  draggedScreenshotPath: string | null;
  dragOverScreenshotPath: string | null;
  screenshotContextMenu: { x: number; y: number; imagePath: string } | null;
  filePathToSrc: (filePath: string | null) => string | null;
  setFeaturedImportTarget: Dispatch<SetStateAction<'poster' | 'card' | 'background' | null>>;
  setPendingFeaturedDropPaths: Dispatch<SetStateAction<string[]>>;
  setDragSection: Dispatch<SetStateAction<'featured' | 'gallery' | null>>;
  setDraggedScreenshotPath: Dispatch<SetStateAction<string | null>>;
  setDragOverScreenshotPath: Dispatch<SetStateAction<string | null>>;
  setScreenshotContextMenu: Dispatch<SetStateAction<{ x: number; y: number; imagePath: string } | null>>;
  closePicturesModal: () => void;
  importMedia: (target: 'poster' | 'card' | 'background' | 'screenshot', filePaths?: string[]) => Promise<void>;
  reorderScreenshots: (fromPath: string, toPath: string) => Promise<void>;
  removeScreenshot: (imagePath: string) => Promise<void>;
  isLogModalOpen: boolean;
  isLogLoading: boolean;
  isLogClearing: boolean;
  filteredLogContents: string;
  logLevelFilter: 'all' | 'info' | 'warn' | 'error';
  logDateFilter: string;
  closeLogViewer: () => void;
  setLogLevelFilter: Dispatch<SetStateAction<'all' | 'info' | 'warn' | 'error'>>;
  setLogDateFilter: Dispatch<SetStateAction<string>>;
  clearLogsFromViewer: () => Promise<void>;
  screenshotModalPath: string | null;
  setScreenshotModalPath: Dispatch<SetStateAction<string | null>>;
  isVaultUnlockModalOpen: boolean;
  vaultPinInput: string;
  vaultPinError: string | null;
  setVaultPinInput: Dispatch<SetStateAction<string>>;
  confirmVaultUnlock: () => void;
  cancelVaultUnlock: () => void;
  isVaultPinModalOpen: boolean;
  hasExistingVaultPin: boolean;
  newVaultPinInput: string;
  confirmVaultPinInput: string;
  vaultPinModalError: string | null;
  setNewVaultPinInput: Dispatch<SetStateAction<string>>;
  setConfirmVaultPinInput: Dispatch<SetStateAction<string>>;
  saveVaultPin: () => void;
  cancelVaultPinEditor: () => void;
};

export function ModalHost({
  games,
  isMirrorSyncConfirmOpen,
  onConfirmMirrorSync,
  onCancelMirrorSync,
  isMirrorParityConfirmOpen,
  onConfirmMirrorParitySync,
  onCancelMirrorParitySync,
  metadataModalGamePath,
  metadataDraft,
  statusChoices,
  activeMetadataTagEditorIndex,
  activeTagAutocomplete,
  activeTagSuggestions,
  isMetadataSaving,
  closeMetadataModal,
  saveMetadataChanges,
  setMetadataDraft,
  setActiveMetadataTagEditorIndex,
  setActiveTagAutocomplete,
  handleTagAutocompleteKeyDown,
  applyTagSuggestion,
  mediaModalGame,
  mediaModalGamePath,
  isMediaSaving,
  mediaUploadProgress,
  featuredImportTarget,
  pendingFeaturedDropPaths,
  dragSection,
  draggedScreenshotPath,
  dragOverScreenshotPath,
  screenshotContextMenu,
  filePathToSrc,
  setFeaturedImportTarget,
  setPendingFeaturedDropPaths,
  setDragSection,
  setDraggedScreenshotPath,
  setDragOverScreenshotPath,
  setScreenshotContextMenu,
  closePicturesModal,
  importMedia,
  reorderScreenshots,
  removeScreenshot,
  isLogModalOpen,
  isLogLoading,
  isLogClearing,
  filteredLogContents,
  logLevelFilter,
  logDateFilter,
  closeLogViewer,
  setLogLevelFilter,
  setLogDateFilter,
  clearLogsFromViewer,
  screenshotModalPath,
  setScreenshotModalPath,
  isVaultUnlockModalOpen,
  vaultPinInput,
  vaultPinError,
  setVaultPinInput,
  confirmVaultUnlock,
  cancelVaultUnlock,
  isVaultPinModalOpen,
  hasExistingVaultPin,
  newVaultPinInput,
  confirmVaultPinInput,
  vaultPinModalError,
  setNewVaultPinInput,
  setConfirmVaultPinInput,
  saveVaultPin,
  cancelVaultPinEditor,
}: ModalHostProps) {
  const { t } = useTranslation();
  const thumbsViewportRef = useRef<HTMLDivElement | null>(null);
  const [isThumbOverflowing, setIsThumbOverflowing] = useState(false);
  const [canScrollThumbsPrev, setCanScrollThumbsPrev] = useState(false);
  const [canScrollThumbsNext, setCanScrollThumbsNext] = useState(false);

  const screenshotGallery = useMemo(() => {
    if (!screenshotModalPath) {
      return {
        screenshots: [] as string[],
        currentIndex: -1,
      };
    }

    const owningGame = games.find((game) => game.media.screenshots.includes(screenshotModalPath));
    if (!owningGame) {
      return {
        screenshots: [screenshotModalPath],
        currentIndex: 0,
      };
    }

    const currentIndex = owningGame.media.screenshots.indexOf(screenshotModalPath);
    return {
      screenshots: owningGame.media.screenshots,
      currentIndex: currentIndex >= 0 ? currentIndex : 0,
    };
  }, [games, screenshotModalPath]);

  const hasLightboxGallery = screenshotGallery.screenshots.length > 1;

  useEffect(() => {
    if (!hasLightboxGallery) {
      setCanScrollThumbsPrev(false);
      setCanScrollThumbsNext(false);
      return;
    }

    const viewport = thumbsViewportRef.current;
    if (!viewport) {
      return;
    }

    const updateThumbScrollState = () => {
      const overflowAmount = viewport.scrollWidth - viewport.clientWidth;
      const isOverflowing = overflowAmount > 4;
      setIsThumbOverflowing(isOverflowing);

      if (!isOverflowing) {
        setCanScrollThumbsPrev(false);
        setCanScrollThumbsNext(false);
        return;
      }

      const maxScroll = viewport.scrollWidth - viewport.clientWidth;
      setCanScrollThumbsPrev(viewport.scrollLeft > 1);
      setCanScrollThumbsNext(viewport.scrollLeft < maxScroll - 1);
    };

    const syncActiveThumbIntoView = () => {
      const activeThumb = viewport.querySelector<HTMLButtonElement>('.lightbox-thumb--active');
      activeThumb?.scrollIntoView({ block: 'nearest', inline: 'center' });
      updateThumbScrollState();
    };

    updateThumbScrollState();
    syncActiveThumbIntoView();

    viewport.addEventListener('scroll', updateThumbScrollState, { passive: true });
    window.addEventListener('resize', updateThumbScrollState);

    return () => {
      viewport.removeEventListener('scroll', updateThumbScrollState);
      window.removeEventListener('resize', updateThumbScrollState);
    };
  }, [hasLightboxGallery, screenshotModalPath, screenshotGallery.screenshots.length]);

  function moveLightbox(delta: number) {
    if (!screenshotGallery.screenshots.length || screenshotGallery.currentIndex < 0) {
      return;
    }

    const nextIndex = (screenshotGallery.currentIndex + delta + screenshotGallery.screenshots.length) % screenshotGallery.screenshots.length;
    setScreenshotModalPath(screenshotGallery.screenshots[nextIndex] ?? null);
  }

  function scrollThumbs(delta: number) {
    const viewport = thumbsViewportRef.current;
    if (!viewport) {
      return;
    }

    const thumbnail = viewport.querySelector<HTMLElement>('.lightbox-thumb');
    const thumbWidth = thumbnail?.getBoundingClientRect().width ?? 88;
    viewport.scrollBy({ left: delta * (thumbWidth + 8), behavior: 'smooth' });
  }

  return (
    <>
      {metadataModalGamePath && metadataDraft ? (
        <MetadataModal
          metadataDraft={metadataDraft}
          statusChoices={statusChoices}
          activeMetadataTagEditorIndex={activeMetadataTagEditorIndex}
          activeTagAutocomplete={activeTagAutocomplete}
          activeTagSuggestions={activeTagSuggestions}
          isMetadataSaving={isMetadataSaving}
          onClose={closeMetadataModal}
          onSave={() => {
            void saveMetadataChanges();
          }}
          onSetMetadataDraft={(updater) => {
            setMetadataDraft((current) => {
              // Guard against close/race conditions where modal state was cleared mid-update.
              if (!current) {
                return current;
              }

              // Preserve support for both direct value writes and functional state updaters.
              return typeof updater === 'function'
                ? (updater as (entry: typeof current) => typeof current)(current)
                : updater;
            });
          }}
          onSetActiveMetadataTagEditorIndex={setActiveMetadataTagEditorIndex}
          onSetActiveTagAutocomplete={setActiveTagAutocomplete}
          onHandleTagAutocompleteKeyDown={handleTagAutocompleteKeyDown}
          onApplyTagSuggestion={applyTagSuggestion}
        />
      ) : null}

      <MediaModal
        game={mediaModalGame}
        // Require both path and resolved game object to avoid partially-initialized modal renders.
        isOpen={Boolean(mediaModalGamePath && mediaModalGame)}
        isMediaSaving={isMediaSaving}
        mediaUploadProgress={mediaUploadProgress}
        featuredImportTarget={featuredImportTarget}
        pendingFeaturedDropPaths={pendingFeaturedDropPaths}
        dragSection={dragSection}
        draggedScreenshotPath={draggedScreenshotPath}
        dragOverScreenshotPath={dragOverScreenshotPath}
        screenshotContextMenu={screenshotContextMenu}
        getImageSrc={filePathToSrc}
        setFeaturedImportTarget={setFeaturedImportTarget}
        setPendingFeaturedDropPaths={setPendingFeaturedDropPaths}
        setDragSection={setDragSection}
        setDraggedScreenshotPath={setDraggedScreenshotPath}
        setDragOverScreenshotPath={setDragOverScreenshotPath}
        setScreenshotContextMenu={setScreenshotContextMenu}
        onClose={closePicturesModal}
        onImportMedia={importMedia}
        onReorderScreenshots={reorderScreenshots}
        onRemoveScreenshot={removeScreenshot}
      />

      {isLogModalOpen ? (
        <LogViewerModal
          isLogLoading={isLogLoading}
          isLogClearing={isLogClearing}
          filteredLogContents={filteredLogContents}
          logLevelFilter={logLevelFilter}
          logDateFilter={logDateFilter}
          onClose={closeLogViewer}
          onChangeLogLevel={(nextValue) => setLogLevelFilter(nextValue)}
          onChangeDateFilter={(nextValue) => setLogDateFilter(nextValue)}
          onClearLogs={() => void clearLogsFromViewer()}
        />
      ) : null}

      {isMirrorSyncConfirmOpen ? (
        <div className="modal-backdrop" onClick={onCancelMirrorSync}>
          <section className="modal-panel modal-panel--vault" onClick={(event) => event.stopPropagation()}>
            <div className="modal-panel__body modal-panel__body--vault">
              <h3>{t('setup.metadataMirrorSyncTitle')}</h3>
              <p>{t('setup.metadataMirrorSyncBody')}</p>
              <div className="modal-panel__vault-actions">
                <button className="button" type="button" onClick={onCancelMirrorSync}>{t('setup.metadataMirrorSyncLater')}</button>
                <button className="button button--primary" type="button" onClick={onConfirmMirrorSync}>{t('setup.metadataMirrorSyncNow')}</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {isMirrorParityConfirmOpen ? (
        <div className="modal-backdrop" onClick={onCancelMirrorParitySync}>
          <section className="modal-panel modal-panel--vault modal-panel--danger" onClick={(event) => event.stopPropagation()}>
            <div className="modal-panel__body modal-panel__body--vault modal-panel__body--danger">
              <h3>{t('setup.metadataMirrorParitySyncConfirmTitle')}</h3>
              <p>{t('setup.metadataMirrorParitySyncConfirmBody')}</p>
              <div className="modal-panel__vault-actions">
                <button className="button" type="button" onClick={onCancelMirrorParitySync}>{t('setup.metadataMirrorParitySyncCancel')}</button>
                <button className="button button--danger" type="button" onClick={onConfirmMirrorParitySync}>{t('setup.metadataMirrorParitySyncConfirmAction')}</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {screenshotModalPath ? (
        // Backdrop click closes lightbox; inner panel stops propagation to keep interactions local.
        <div className="modal-backdrop" onClick={() => setScreenshotModalPath(null)}>
          <section className="modal-panel modal-panel--lightbox" onClick={(event) => event.stopPropagation()}>
            <div className={`modal-panel__body modal-panel__body--lightbox ${hasLightboxGallery ? 'modal-panel__body--lightbox-has-thumbs' : ''}`}>
              <div className="lightbox-stage">
                {hasLightboxGallery ? (
                  <button
                    className="lightbox-nav-zone lightbox-nav-zone--prev"
                    type="button"
                    onClick={() => moveLightbox(-1)}
                    aria-label={t('gameView.previousScreenshot')}
                    title={t('gameView.previousScreenshot')}
                  >
                    <span className="lightbox-nav-zone__icon" aria-hidden="true">
                      <ChevronLeft size={22} aria-hidden="true" />
                    </span>
                  </button>
                ) : null}
                <img src={filePathToSrc(screenshotModalPath) ?? undefined} alt={t('media.screenshotAlt')} className="lightbox-image" />
                {hasLightboxGallery ? (
                  <button
                    className="lightbox-nav-zone lightbox-nav-zone--next"
                    type="button"
                    onClick={() => moveLightbox(1)}
                    aria-label={t('gameView.nextScreenshot')}
                    title={t('gameView.nextScreenshot')}
                  >
                    <span className="lightbox-nav-zone__icon" aria-hidden="true">
                      <ChevronRight size={22} aria-hidden="true" />
                    </span>
                  </button>
                ) : null}
              </div>
              {hasLightboxGallery ? (
                <div className="lightbox-thumbs-shell">
                  {isThumbOverflowing ? (
                    <button
                      className="lightbox-thumbs-nav"
                      type="button"
                      onClick={() => scrollThumbs(-1)}
                      disabled={!canScrollThumbsPrev}
                      aria-label={t('gameView.previousScreenshot')}
                      title={t('gameView.previousScreenshot')}
                    >
                      <ChevronLeft size={18} aria-hidden="true" />
                    </button>
                  ) : <span className="lightbox-thumbs-nav-spacer" aria-hidden="true" />}
                  <div className="lightbox-thumbs-viewport" ref={thumbsViewportRef} role="list" aria-label={t('detail.screenshots')}>
                    <div className={`lightbox-thumbs-track ${!isThumbOverflowing ? 'lightbox-thumbs-track--centered' : ''}`}>
                      {screenshotGallery.screenshots.map((imagePath) => (
                        <button
                          key={imagePath}
                          type="button"
                          role="listitem"
                          className={`lightbox-thumb ${imagePath === screenshotModalPath ? 'lightbox-thumb--active' : ''}`}
                          onClick={() => setScreenshotModalPath(imagePath)}
                        >
                          <img src={filePathToSrc(imagePath) ?? undefined} alt={t('media.screenshotAlt')} />
                        </button>
                      ))}
                    </div>
                  </div>
                  {isThumbOverflowing ? (
                    <button
                      className="lightbox-thumbs-nav"
                      type="button"
                      onClick={() => scrollThumbs(1)}
                      disabled={!canScrollThumbsNext}
                      aria-label={t('gameView.nextScreenshot')}
                      title={t('gameView.nextScreenshot')}
                    >
                      <ChevronRight size={18} aria-hidden="true" />
                    </button>
                  ) : <span className="lightbox-thumbs-nav-spacer" aria-hidden="true" />}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {isVaultUnlockModalOpen ? (
        <VaultUnlockModal
          pinValue={vaultPinInput}
          pinError={vaultPinError}
          onPinValueChange={setVaultPinInput}
          onConfirm={confirmVaultUnlock}
          onCancel={cancelVaultUnlock}
        />
      ) : null}

      {isVaultPinModalOpen ? (
        <VaultPinModal
          hasExistingPin={hasExistingVaultPin}
          newPinValue={newVaultPinInput}
          confirmPinValue={confirmVaultPinInput}
          pinError={vaultPinModalError}
          onNewPinValueChange={setNewVaultPinInput}
          onConfirmPinValueChange={setConfirmVaultPinInput}
          onConfirm={saveVaultPin}
          onCancel={cancelVaultPinEditor}
        />
      ) : null}
    </>
  );
}






