/**
 * Media management modal for featured art and screenshot gallery operations.
 *
 * This overlay coordinates several high-friction workflows in one place:
 * importing via dialog or drop, drag-reordering screenshots, and quick delete
 * actions through a contextual menu. It also preserves local drag intent state
 * so interactions feel predictable while async media updates are pending.
 *
 * New to this project: this is the media workflow UI (import, reorder, remove); trace handlers to useMediaManager for file operations and scan refresh.
 */
import type { Dispatch, SetStateAction } from 'react';
import type { GameSummary } from '../types';
import { MediaModal as SharedMediaModal } from '../../../shared/app-shell/components/MediaModal';

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
  return (
    <SharedMediaModal<GameSummary>
      game={game}
      isOpen={isOpen}
      isMediaSaving={isMediaSaving}
      featuredImportTarget={featuredImportTarget}
      pendingFeaturedDropPaths={pendingFeaturedDropPaths}
      dragSection={dragSection}
      draggedScreenshotPath={draggedScreenshotPath}
      dragOverScreenshotPath={dragOverScreenshotPath}
      screenshotContextMenu={screenshotContextMenu}
      getImageSrc={getImageSrc}
      setFeaturedImportTarget={setFeaturedImportTarget}
      setPendingFeaturedDropPaths={setPendingFeaturedDropPaths}
      setDragSection={setDragSection}
      setDraggedScreenshotPath={setDraggedScreenshotPath}
      setDragOverScreenshotPath={setDragOverScreenshotPath}
      setScreenshotContextMenu={setScreenshotContextMenu}
      onClose={onClose}
      onImportMedia={onImportMedia}
      onReorderScreenshots={onReorderScreenshots}
      onRemoveScreenshot={onRemoveScreenshot}
    />
  );
}






