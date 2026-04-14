/**
 * Provides stable callback adapters for setup/detail/view interactions.
 *
 * These wrappers isolate imperative UI side effects (IPC calls, logging, and
 * navigation-style state updates) from JSX props. The goal is to keep App and
 * presentational components declarative while still exposing concise handlers
 * for commonly triggered actions.
 *
 * New to this project: this hook adapts UI intents into stable callbacks and context-menu triggers; follow GalleryClient menu calls to adapter/main-process context handlers.
 */
import { useCallback, type DragEvent, type MouseEvent } from 'react';
import { useGalleryClient } from '../client/context';
import type { GameSummary } from '../types';

type UseAppViewHandlersArgs = {
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

export function useAppViewHandlers({
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
}: UseAppViewHandlersArgs) {
  const galleryClient = useGalleryClient();

  const onToggleSystemMenuBar = useCallback((nextVisible: boolean) => {
    // Apply immediately for UI responsiveness; persistence still happens via config save flow.
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

  const onGameCardContextMenu = useCallback((targetGame: GameSummary, event: MouseEvent<HTMLElement>) => {
    // Route context actions through adapter menu flow; browser uses web fallback menu.
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






