import { type Dispatch, type SetStateAction } from 'react';
import type { TFunction } from 'i18next';
import { useGalleryClient } from '../client/context';
import { useVaultManager as useSharedVaultManager } from '../../../shared/app-shell/hooks/useVaultManager';
import type { GalleryConfig, GameSummary, ScanResult } from '../types';
import { computeTagPoolUsage } from '../utils/app-helpers';

type UseVaultManagerArgs = {
  config: GalleryConfig | null;
  setConfig: Dispatch<SetStateAction<GalleryConfig | null>>;
  scanResult: ScanResult;
  filteredGames: GameSummary[];
  selectedGamePath: string | null;
  detailGamePath: string | null;
  setSelectedGamePath: Dispatch<SetStateAction<string | null>>;
  setDetailGamePath: Dispatch<SetStateAction<string | null>>;
  setScanResult: Dispatch<SetStateAction<ScanResult>>;
  setStatus: Dispatch<SetStateAction<string>>;
  refreshScan: () => Promise<unknown>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
  t: TFunction;
  onOpenNotificationCenter: () => void;
};

export function useVaultManager(args: UseVaultManagerArgs) {
  const galleryClient = useGalleryClient();
  return useSharedVaultManager<GalleryConfig, GameSummary, ScanResult>({
    galleryClient,
    computeTagPoolUsage,
    ...args,
  });
}
