import { type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { TFunction } from 'i18next';
import { useGalleryClient } from '../client/context';
import { useVersionMismatchManager as useSharedVersionMismatchManager } from '../../../shared/app-shell/hooks/useVersionMismatchManager';
import type { GalleryConfig, ScanResult } from '../types';

type UseVersionMismatchManagerArgs = {
  config: GalleryConfig | null;
  setConfig: Dispatch<SetStateAction<GalleryConfig | null>>;
  scanResult: ScanResult;
  setStatus: Dispatch<SetStateAction<string>>;
  refreshScan: () => Promise<unknown>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
  t: TFunction;
  setDetailGamePath: Dispatch<SetStateAction<string | null>>;
  setSelectedGamePath: Dispatch<SetStateAction<string | null>>;
  cardsContainerRef: RefObject<HTMLDivElement | null>;
};

export function useVersionMismatchManager(args: UseVersionMismatchManagerArgs) {
  const galleryClient = useGalleryClient();
  return useSharedVersionMismatchManager<GalleryConfig, ScanResult['games'][number], ScanResult['games'][number]['metadata']>({
    galleryClient,
    ...args,
  });
}
