/**
 * Encapsulates media modal domain behavior for import and screenshot management.
 *
 * This hook tracks modal scope state, drop targets, reorder drag state, and
 * screenshot context-menu interactions. It also provides normalized helpers for
 * media imports/removals and triggers refresh flows after successful updates.
 *
 * New to this project: this hook owns media modal state machine and file operations; trace import/reorder/remove handlers to gallery media IPC calls.
 */
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { useGalleryClient } from '../client/context';
import {
  importMediaFromBrowserPickerWithProgress,
  resolvePreferredServiceBaseUrl,
  type BrowserMediaUploadProgress,
} from '../client/adapters/webClient';

type UseMediaManagerArgs = {
  setStatus: Dispatch<SetStateAction<string>>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
  refreshGame: (gamePath: string) => Promise<unknown>;
  refreshScan: () => Promise<unknown>;
};

export function useMediaManager({
  setStatus,
  logAppEvent,
  toErrorMessage,
  refreshGame,
  refreshScan,
}: UseMediaManagerArgs) {
  const { t } = useTranslation();
  const galleryClient = useGalleryClient();
  const isBrowserMode = typeof window !== 'undefined' && !('gallery' in window);

  const [mediaModalGamePath, setMediaModalGamePath] = useState<string | null>(null);
  const [isMediaSaving, setIsMediaSaving] = useState(false);
  const [mediaUploadProgress, setMediaUploadProgress] = useState<BrowserMediaUploadProgress | null>(null);
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

    // Distinguish explicit drop payloads from picker flow.
    if (Array.isArray(filePaths) && filePaths.length === 0) {
      return;
    }

    setIsMediaSaving(true);
    setMediaUploadProgress(null);
    try {
      // If drag/drop paths were supplied, bypass the file dialog and import directly.
      if (Array.isArray(filePaths)) {
        await galleryClient.importDroppedGameMedia({
          gamePath: mediaModalGamePath,
          target,
          filePaths,
        });
      } else if (isBrowserMode) {
        await importMediaFromBrowserPickerWithProgress(
          {
            gamePath: mediaModalGamePath,
            target,
          },
          setMediaUploadProgress,
        );
      } else {
        await galleryClient.importGameMediaFromDialog({
          gamePath: mediaModalGamePath,
          target,
        });
      }

      void refreshGame(mediaModalGamePath).then((result) => {
        if (result) {
          return;
        }

        return refreshScan();
      }).catch((error) => {
        const logMessage = toErrorMessage(error, 'Background media refresh failed.');
        void logAppEvent(logMessage, 'warn', 'import-media-refresh');
      });
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
      setMediaUploadProgress(null);
    }
  }

  async function reorderScreenshots(fromPath: string, toPath: string) {
    if (!mediaModalGamePath) {
      return;
    }

    setIsMediaSaving(true);
    try {
      await galleryClient.reorderScreenshots({ fromPath, toPath });
      void refreshGame(mediaModalGamePath).then((result) => {
        if (result) {
          return;
        }

        return refreshScan();
      }).catch((error) => {
        const logMessage = toErrorMessage(error, 'Background screenshot reorder refresh failed.');
        void logAppEvent(logMessage, 'warn', 'reorder-screenshots-refresh');
      });
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
      await galleryClient.removeScreenshot({ screenshotPath: imagePath });
      void refreshGame(mediaModalGamePath).then((result) => {
        if (result) {
          return;
        }

        return refreshScan();
      }).catch((error) => {
        const logMessage = toErrorMessage(error, 'Background screenshot removal refresh failed.');
        void logAppEvent(logMessage, 'warn', 'remove-screenshot-refresh');
      });
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

    if (typeof window !== 'undefined' && !('gallery' in window)) {
      return `${resolvePreferredServiceBaseUrl()}/api/media-file?path=${encodeURIComponent(filePath)}&v=${mediaRenderVersion}`;
    }

    const base = encodeURI(`file:///${filePath.replace(/\\/g, '/')}`);
    // Append a version token so React image elements reload after media mutations.
    return `${base}?v=${mediaRenderVersion}`;
  }

  return {
    mediaModalGamePath,
    isMediaSaving,
    mediaUploadProgress,
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






