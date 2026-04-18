import type { Dispatch, SetStateAction } from 'react';
import { useMediaManager as useSharedMediaManager } from '../../../shared/app-shell/hooks/useMediaManager';
import { useGalleryClient } from '../client/context';
import {
  importMediaFromBrowserPickerWithProgress,
  resolvePreferredServiceBaseUrl,
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
  const galleryClient = useGalleryClient();

  return useSharedMediaManager({
    galleryClient,
    resolvePreferredServiceBaseUrl,
    importMediaFromBrowserPickerWithProgress,
    setStatus,
    logAppEvent,
    toErrorMessage,
    refreshGame,
    refreshScan,
  });
}