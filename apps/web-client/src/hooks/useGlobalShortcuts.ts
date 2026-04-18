import { type Dispatch, type RefObject, type SetStateAction } from 'react';
import { useGlobalShortcuts as useSharedGlobalShortcuts } from '../../../shared/app-shell/hooks/useGlobalShortcuts';
import type { GalleryConfig } from '../types';
import { clamp, isTypingTarget } from '../utils/app-helpers';

type UseGlobalShortcutsArgs = {
  setConfig: Dispatch<SetStateAction<GalleryConfig | null>>;
  searchInputRef: RefObject<HTMLInputElement | null>;
  isScanning: boolean;
  refreshScan: () => Promise<unknown>;
  screenshotModalPath: string | null;
  setScreenshotModalPath: Dispatch<SetStateAction<string | null>>;
};

export function useGlobalShortcuts(args: UseGlobalShortcutsArgs) {
  return useSharedGlobalShortcuts<GalleryConfig>({
    ...args,
    clamp,
    isTypingTarget,
  });
}
