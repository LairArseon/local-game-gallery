import { type DragEvent, type MouseEvent } from 'react';
import { useGalleryClient } from '../client/context';
import { useAppViewHandlers as useSharedAppViewHandlers } from '../../../shared/app-shell/hooks/useAppViewHandlers';
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

export function useAppViewHandlers(args: UseAppViewHandlersArgs) {
  const galleryClient = useGalleryClient();
  return useSharedAppViewHandlers<GameSummary>({
    galleryClient,
    ...args,
  });
}
