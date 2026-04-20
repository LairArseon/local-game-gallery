import { useCallback, type DragEvent, type MouseEvent } from 'react';

type GameSummaryLike = {
  path: string;
  name: string;
  isVaulted?: boolean;
};

type GalleryClientLike = {
  setMenuBarVisibility: (nextVisible: boolean) => Promise<unknown> | unknown;
  showVersionContextMenu: (args: { versionPath: string; versionName: string }) => Promise<unknown> | unknown;
  showGameContextMenu: (args: {
    gamePath: string;
    gameName: string;
    isVaultOpen: boolean;
    isGameVaulted?: boolean;
    canPlay: boolean;
    anchorX: number;
    anchorY: number;
  }) => Promise<unknown> | unknown;
  showVaultContextMenu: (args: {
    isVaultOpen: boolean;
    hasVaultPin: boolean;
    anchorX: number;
    anchorY: number;
  }) => Promise<unknown> | unknown;
};

type UseAppViewHandlersArgs<TGame extends GameSummaryLike> = {
  galleryClient: GalleryClientLike;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  openLogViewer: () => Promise<unknown>;
  openLogFolderFromSetup: () => Promise<unknown>;
  pickAppIconPng: () => Promise<unknown>;
  handleDropAppIconFile: (event: DragEvent<HTMLDivElement>) => Promise<unknown>;
  applyAppIconNow: () => Promise<unknown>;
  openFolderInExplorer: (folderPath: string) => Promise<unknown>;
  setDetailGamePath: (value: string | null) => void;
  canLaunch: boolean;
  supportsNativeContextMenu: boolean;
  isVaultOpen: boolean;
  hasVaultPin: boolean;
};

export function useAppViewHandlers<TGame extends GameSummaryLike>({
  galleryClient,
  logAppEvent,
  openLogViewer,
  openLogFolderFromSetup,
  pickAppIconPng,
  handleDropAppIconFile,
  applyAppIconNow,
  openFolderInExplorer,
  setDetailGamePath,
  canLaunch,
  supportsNativeContextMenu,
  isVaultOpen,
  hasVaultPin,
}: UseAppViewHandlersArgs<TGame>) {
  const onToggleSystemMenuBar = useCallback((nextVisible: boolean) => {
    void galleryClient.setMenuBarVisibility(nextVisible);
    void logAppEvent(`System menu bar ${nextVisible ? 'shown' : 'hidden'} from setup toggle.`, 'info', 'menu-bar');
  }, [galleryClient, logAppEvent]);

  const onOpenLogViewer = useCallback(() => {
    void openLogViewer();
  }, [openLogViewer]);

  const onOpenLogFolder = useCallback(() => {
    void openLogFolderFromSetup();
  }, [openLogFolderFromSetup]);

  const onPickAppIcon = useCallback(() => {
    void pickAppIconPng();
  }, [pickAppIconPng]);

  const onDropAppIconFile = useCallback((event: DragEvent<HTMLDivElement>) => {
    void handleDropAppIconFile(event);
  }, [handleDropAppIconFile]);

  const onApplyAppIconNow = useCallback(() => {
    void applyAppIconNow();
  }, [applyAppIconNow]);

  const onBackFromDetail = useCallback(() => {
    if (typeof window !== 'undefined') {
      const state = window.history.state;
      if (state && typeof state === 'object' && (state as Record<string, unknown>).__lggDetailOpen === true) {
        window.history.back();
        return;
      }
    }

    setDetailGamePath(null);
  }, [setDetailGamePath]);

  const onOpenGameFolder = useCallback((gamePath: string) => {
    void openFolderInExplorer(gamePath);
  }, [openFolderInExplorer]);

  const onOpenVersionFolder = useCallback((versionPath: string) => {
    void openFolderInExplorer(versionPath);
  }, [openFolderInExplorer]);

  const onOpenVersionContextMenu = useCallback((versionPath: string, versionName: string) => {
    if (!supportsNativeContextMenu) {
      return;
    }

    void galleryClient.showVersionContextMenu({
      versionPath,
      versionName,
    });
  }, [galleryClient, supportsNativeContextMenu]);

  const onGameCardContextMenu = useCallback((targetGame: TGame, event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    void galleryClient.showGameContextMenu({
      gamePath: targetGame.path,
      gameName: targetGame.name,
      isVaultOpen,
      isGameVaulted: targetGame.isVaulted,
      canPlay: canLaunch,
      anchorX: event.clientX,
      anchorY: event.clientY,
    });
  }, [canLaunch, galleryClient, isVaultOpen]);

  const onOpenVaultContextMenu = useCallback((event: MouseEvent<HTMLButtonElement>, hasPinFromUI: boolean) => {
    event.preventDefault();
    void galleryClient.showVaultContextMenu({
      isVaultOpen,
      hasVaultPin: hasPinFromUI || hasVaultPin,
      anchorX: event.clientX,
      anchorY: event.clientY,
    });
  }, [galleryClient, hasVaultPin, isVaultOpen]);

  return {
    onToggleSystemMenuBar,
    onOpenLogViewer,
    onOpenLogFolder,
    onPickAppIcon,
    onDropAppIconFile,
    onApplyAppIconNow,
    onBackFromDetail,
    onOpenGameFolder,
    onOpenVersionFolder,
    onOpenVersionContextMenu,
    onGameCardContextMenu,
    onOpenVaultContextMenu,
  };
}
