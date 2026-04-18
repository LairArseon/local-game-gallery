import { useGalleryClient } from '../client/context';
import { useStartupTagPoolSync as useSharedStartupTagPoolSync } from '../../../shared/app-shell/hooks/useStartupTagPoolSync';
import type { GalleryConfig, ScanResult } from '../types';
import { normalizeTagPool } from '../utils/app-helpers';
import { type Dispatch, type SetStateAction } from 'react';

type UseStartupTagPoolSyncArgs = {
  config: GalleryConfig | null;
  scanResult: ScanResult;
  setConfig: Dispatch<SetStateAction<GalleryConfig | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
};

export function useStartupTagPoolSync(args: UseStartupTagPoolSyncArgs) {
  const galleryClient = useGalleryClient();
  useSharedStartupTagPoolSync<GalleryConfig, ScanResult['games'][number]>({
    galleryClient,
    normalizeTagPool,
    ...args,
  });
}
