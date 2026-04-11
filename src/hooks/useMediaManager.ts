/**
 * Encapsulates media modal domain behavior for import and screenshot management.
 *
 * This hook tracks modal scope state, drop targets, reorder drag state, and
 * screenshot context-menu interactions. It also provides normalized helpers for
 * media imports/removals and triggers refresh flows after successful updates.
 */
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';

type UseMediaManagerArgs = {
  setStatus: Dispatch<SetStateAction<string>>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
  refreshScan: () => Promise<unknown>;
};

export function useMediaManager({
  setStatus,
  logAppEvent,
  toErrorMessage,
  refreshScan,
}: UseMediaManagerArgs) {
  const { t } = useTranslation();

  const [mediaModalGamePath, setMediaModalGamePath] = useState<string | null>(null);
  const [isMediaSaving, setIsMediaSaving] = useState(false);
  const [mediaRenderVersion, setMediaRenderVersion] = useState(0);
  const [featuredImportTarget, setFeaturedImportTarget] = useState<'poster' | 'card' | 'background' | null>(null);
  const [pendingFeaturedDropPaths, setPendingFeaturedDropPaths] = useState<string[]>([]);
  const [dragSection, setDragSection] = useState<'featured' | 'gallery' | null>(null);
  const [draggedScreenshotPath, setDraggedScreenshotPath] = useState<string | null>(null);
  const [dragOverScreenshotPath, setDragOverScreenshotPath] = useState<string | null>(null);
  const [screenshotContextMenu, setScreenshotContextMenu] = useState<{ x: number; y: number; imagePath: string } | null>(null);

  useEffect(() => {
    if (!screenshotContextMenu) {
      return;
    }

    // Context menus should close on outside click, alternate contextmenu open,
    // or escape so stale menu coordinates do not linger.
    const closeMenu = () => {
      setScreenshotContextMenu(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setScreenshotContextMenu(null);
      }
    };

    window.addEventListener('click', closeMenu);
    window.addEventListener('contextmenu', closeMenu);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('contextmenu', closeMenu);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [screenshotContextMenu]);

  function openPicturesModal(gamePath: string) {
    setFeaturedImportTarget(null);
    setPendingFeaturedDropPaths([]);
    setDraggedScreenshotPath(null);
    setDragOverScreenshotPath(null);
    setScreenshotContextMenu(null);
    setMediaModalGamePath(gamePath);
  }

  function closePicturesModal() {
    setMediaModalGamePath(null);
  }

  async function importMedia(target: 'poster' | 'card' | 'background' | 'screenshot', filePaths?: string[]) {
    if (!mediaModalGamePath) {
      return;
    }

    setIsMediaSaving(true);
    try {
      // If drag/drop paths were supplied, bypass the file dialog and import directly.
      if (filePaths?.length) {
        await window.gallery.importDroppedGameMedia({
          gamePath: mediaModalGamePath,
          target,
          filePaths,
        });
      } else {
        await window.gallery.importGameMediaFromDialog({
          gamePath: mediaModalGamePath,
          target,
        });
      }

      await refreshScan();
  // Force image URL cache-busting so changed assets are visible immediately.
      setMediaRenderVersion((current) => current + 1);
      setFeaturedImportTarget(null);
      setPendingFeaturedDropPaths([]);
      setStatus(t('status.picturesUpdated'));
    } catch (error) {
      const logMessage = toErrorMessage(error, 'Failed to import pictures.');
      setStatus(t('status.failedImportPictures'));
      void logAppEvent(logMessage, 'error', 'import-media');
    } finally {
      setIsMediaSaving(false);
    }
  }

  async function reorderScreenshots(fromPath: string, toPath: string) {
    if (!mediaModalGamePath) {
      return;
    }

    setIsMediaSaving(true);
    try {
      await window.gallery.reorderScreenshots({ fromPath, toPath });
      await refreshScan();
      setMediaRenderVersion((current) => current + 1);
      setStatus(t('status.screenshotsReordered'));
    } catch (error) {
      const logMessage = toErrorMessage(error, 'Failed to reorder screenshots.');
      setStatus(t('status.failedReorderScreenshots'));
      void logAppEvent(logMessage, 'error', 'reorder-screenshots');
    } finally {
      setIsMediaSaving(false);
    }
  }

  async function removeScreenshot(imagePath: string) {
    if (!mediaModalGamePath) {
      return;
    }

    setScreenshotContextMenu(null);
    setIsMediaSaving(true);
    try {
      await window.gallery.removeScreenshot({ screenshotPath: imagePath });
      await refreshScan();
      setMediaRenderVersion((current) => current + 1);
      setStatus(t('status.screenshotRemoved'));
    } catch (error) {
      const logMessage = toErrorMessage(error, 'Failed to remove screenshot.');
      setStatus(t('status.failedRemoveScreenshot'));
      void logAppEvent(logMessage, 'error', 'remove-screenshot');
    } finally {
      setIsMediaSaving(false);
    }
  }

  function filePathToSrc(filePath: string | null) {
    if (!filePath) {
      return null;
    }

    const base = encodeURI(`file:///${filePath.replace(/\\/g, '/')}`);
    // Append a version token so React image elements reload after media mutations.
    return `${base}?v=${mediaRenderVersion}`;
  }

  return {
    mediaModalGamePath,
    isMediaSaving,
    featuredImportTarget,
    pendingFeaturedDropPaths,
    dragSection,
    draggedScreenshotPath,
    dragOverScreenshotPath,
    screenshotContextMenu,
    setFeaturedImportTarget,
    setPendingFeaturedDropPaths,
    setDragSection,
    setDraggedScreenshotPath,
    setDragOverScreenshotPath,
    setScreenshotContextMenu,
    openPicturesModal,
    closePicturesModal,
    importMedia,
    reorderScreenshots,
    removeScreenshot,
    filePathToSrc,
  };
}
