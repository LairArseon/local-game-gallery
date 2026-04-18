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
import type { ReactNode } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { LogViewerModal } from './LogViewerModal';
import { MediaModal } from './MediaModal';
import { MetadataModal } from './MetadataModal';
import { VaultPinModal } from './VaultPinModal';
import { VaultUnlockModal } from './VaultUnlockModal';
import type { GameMetadata, GameSummary } from '../types';
import type { BrowserMediaUploadProgress } from '../client/adapters/webClient';
import { ModalHost as SharedModalHost } from '../../../shared/app-shell/components/ModalHost';

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
  isDecompressLaunchConfirmOpen: boolean;
  decompressLaunchGameName: string;
  decompressLaunchVersionName: string;
  onConfirmDecompressLaunch: () => void;
  onCancelDecompressLaunch: () => void;
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
  isDecompressLaunchConfirmOpen,
  decompressLaunchGameName,
  decompressLaunchVersionName,
  onConfirmDecompressLaunch,
  onCancelDecompressLaunch,
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
  const metadataModal: ReactNode = metadataModalGamePath && metadataDraft ? (
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
          if (!current) {
            return current;
          }

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
  ) : null;

  const mediaModal: ReactNode = (
    <MediaModal
      game={mediaModalGame}
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
  );

  const logViewerModal: ReactNode = isLogModalOpen ? (
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
  ) : null;

  const vaultUnlockModal: ReactNode = isVaultUnlockModalOpen ? (
    <VaultUnlockModal
      pinValue={vaultPinInput}
      pinError={vaultPinError}
      onPinValueChange={setVaultPinInput}
      onConfirm={confirmVaultUnlock}
      onCancel={cancelVaultUnlock}
    />
  ) : null;

  const vaultPinModal: ReactNode = isVaultPinModalOpen ? (
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
  ) : null;

  return (
    <SharedModalHost<GameSummary>
      games={games}
      metadataModal={metadataModal}
      mediaModal={mediaModal}
      logViewerModal={logViewerModal}
      vaultUnlockModal={vaultUnlockModal}
      vaultPinModal={vaultPinModal}
      isMirrorSyncConfirmOpen={isMirrorSyncConfirmOpen}
      onConfirmMirrorSync={onConfirmMirrorSync}
      onCancelMirrorSync={onCancelMirrorSync}
      isMirrorParityConfirmOpen={isMirrorParityConfirmOpen}
      onConfirmMirrorParitySync={onConfirmMirrorParitySync}
      onCancelMirrorParitySync={onCancelMirrorParitySync}
      isDecompressLaunchConfirmOpen={isDecompressLaunchConfirmOpen}
      decompressLaunchGameName={decompressLaunchGameName}
      decompressLaunchVersionName={decompressLaunchVersionName}
      onConfirmDecompressLaunch={onConfirmDecompressLaunch}
      onCancelDecompressLaunch={onCancelDecompressLaunch}
      screenshotModalPath={screenshotModalPath}
      setScreenshotModalPath={setScreenshotModalPath}
      filePathToSrc={filePathToSrc}
    />
  );
}






