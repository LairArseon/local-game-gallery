/**
 * Centralized overlay host for all app modal surfaces.
 *
 * This component keeps modal composition out of App by wiring metadata, media,
 * log viewer, and screenshot lightbox overlays in one place. It preserves each
 * modal's existing callback contracts and orchestrates conditional rendering so
 * App stays focused on state orchestration rather than modal markup volume.
 */
import type { Dispatch, SetStateAction } from 'react';
import { LogViewerModal } from './LogViewerModal';
import { MediaModal } from './MediaModal';
import { MetadataModal } from './MetadataModal';
import type { GameMetadata, GameSummary } from '../types';

type TagAutocompleteState = {
  scope: 'pool' | 'filter' | 'metadata';
  index: number;
  highlighted: number;
} | null;

type ModalHostProps = {
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
};

export function ModalHost({
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
}: ModalHostProps) {
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

      {screenshotModalPath ? (
        // Backdrop click closes lightbox; inner panel stops propagation to keep interactions local.
        <div className="modal-backdrop" onClick={() => setScreenshotModalPath(null)}>
          <section className="modal-panel modal-panel--lightbox" onClick={(event) => event.stopPropagation()}>
            <header className="modal-panel__header">
              <h2>Screenshot</h2>
              <button className="button" type="button" onClick={() => setScreenshotModalPath(null)}>Close</button>
            </header>
            <div className="modal-panel__body modal-panel__body--lightbox">
              <img src={filePathToSrc(screenshotModalPath) ?? undefined} alt="Screenshot preview" className="lightbox-image" />
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
