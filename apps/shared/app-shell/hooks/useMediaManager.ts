import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaImageVariant } from '../types/gameDisplayTypes';

type GalleryClientLike = {
  importDroppedGameMedia: (payload: {
    gamePath: string;
    target: 'poster' | 'card' | 'background' | 'screenshot';
    filePaths: string[];
  }) => Promise<unknown>;
  importGameMediaFromDialog: (payload: {
    gamePath: string;
    target: 'poster' | 'card' | 'background' | 'screenshot';
  }) => Promise<unknown>;
  reorderScreenshots: (payload: { fromPath: string; toPath: string }) => Promise<unknown>;
  removeScreenshot: (payload: { screenshotPath: string }) => Promise<unknown>;
};

type BrowserMediaUploadProgress = {
  completed: number;
  total: number;
  phase: 'preparing' | 'uploading' | 'finalizing';
};

type RefreshMediaArgs = {
  gamePath: string;
  refreshScan: () => Promise<unknown>;
  refreshGame?: (gamePath: string) => Promise<unknown>;
  toErrorMessage: (error: unknown, fallback: string) => string;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  source: 'import-media-refresh' | 'reorder-screenshots-refresh' | 'remove-screenshot-refresh';
  fallbackMessage: string;
};

type UseMediaManagerArgs = {
  galleryClient: GalleryClientLike;
  resolvePreferredServiceBaseUrl: () => string;
  importMediaFromBrowserPickerWithProgress?: (
    payload: { gamePath: string; target: 'poster' | 'card' | 'background' | 'screenshot' },
    setProgress: Dispatch<SetStateAction<BrowserMediaUploadProgress | null>>,
  ) => Promise<unknown>;
  setStatus: Dispatch<SetStateAction<string>>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
  refreshScan: () => Promise<unknown>;
  refreshGame?: (gamePath: string) => Promise<unknown>;
};

function defaultRefreshAfterMediaChange({ gamePath, refreshScan, refreshGame, toErrorMessage, logAppEvent, source, fallbackMessage }: RefreshMediaArgs) {
  if (!refreshGame) {
    void refreshScan();
    return;
  }

  void refreshGame(gamePath).then((result) => {
    if (result) {
      return;
    }

    return refreshScan();
  }).catch((error) => {
    const logMessage = toErrorMessage(error, fallbackMessage);
    void logAppEvent(logMessage, 'warn', source);
  });
}

export function useMediaManager({
  galleryClient,
  resolvePreferredServiceBaseUrl,
  importMediaFromBrowserPickerWithProgress,
  setStatus,
  logAppEvent,
  toErrorMessage,
  refreshScan,
  refreshGame,
}: UseMediaManagerArgs) {
  const { t } = useTranslation();
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

    if (Array.isArray(filePaths) && filePaths.length === 0) {
      return;
    }

    setIsMediaSaving(true);
    setMediaUploadProgress(null);
    try {
      if (Array.isArray(filePaths)) {
        await galleryClient.importDroppedGameMedia({
          gamePath: mediaModalGamePath,
          target,
          filePaths,
        });
      } else if (isBrowserMode && importMediaFromBrowserPickerWithProgress) {
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

      defaultRefreshAfterMediaChange({
        gamePath: mediaModalGamePath,
        refreshScan,
        refreshGame,
        toErrorMessage,
        logAppEvent,
        source: 'import-media-refresh',
        fallbackMessage: 'Background media refresh failed.',
      });
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
      defaultRefreshAfterMediaChange({
        gamePath: mediaModalGamePath,
        refreshScan,
        refreshGame,
        toErrorMessage,
        logAppEvent,
        source: 'reorder-screenshots-refresh',
        fallbackMessage: 'Background screenshot reorder refresh failed.',
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
      defaultRefreshAfterMediaChange({
        gamePath: mediaModalGamePath,
        refreshScan,
        refreshGame,
        toErrorMessage,
        logAppEvent,
        source: 'remove-screenshot-refresh',
        fallbackMessage: 'Background screenshot removal refresh failed.',
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

  function filePathToSrc(filePath: string | null, variant: MediaImageVariant = 'original') {
    if (!filePath) {
      return null;
    }

    if (typeof window !== 'undefined' && !('gallery' in window)) {
      return `${resolvePreferredServiceBaseUrl()}/api/media-file?path=${encodeURIComponent(filePath)}&variant=${encodeURIComponent(variant)}&v=${mediaRenderVersion}`;
    }

    const base = encodeURI(`file:///${filePath.replace(/\\/g, '/')}`);
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
