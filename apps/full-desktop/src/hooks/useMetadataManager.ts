import type { Dispatch, SetStateAction } from 'react';
import { useMetadataManager as useSharedMetadataManager } from '../../../shared/app-shell/hooks/useMetadataManager';
import { useGalleryClient } from '../client/context';
import type { GalleryConfig, GameMetadata, GameSummary } from '../types';
import { normalizeTagPool } from '../utils/app-helpers';

type TagAutocompleteState = {
  scope: 'pool' | 'filter' | 'metadata';
  index: number;
  highlighted: number;
} | null;

type UseMetadataManagerArgs = {
  config: GalleryConfig | null;
  setConfig: Dispatch<SetStateAction<GalleryConfig | null>>;
  games: GameSummary[];
  setStatus: Dispatch<SetStateAction<string>>;
  refreshScan: () => Promise<unknown>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
  setActiveTagAutocomplete: Dispatch<SetStateAction<TagAutocompleteState>>;
};

export function useMetadataManager({
  config,
  setConfig,
  games,
  setStatus,
  refreshScan,
  logAppEvent,
  toErrorMessage,
  setActiveTagAutocomplete,
}: UseMetadataManagerArgs) {
  const galleryClient = useGalleryClient();

  return useSharedMetadataManager<GalleryConfig, GameMetadata, GameSummary>({
    galleryClient,
    normalizeTagPool,
    config,
    setConfig,
    games,
    setStatus,
    refreshScan,
    logAppEvent,
    toErrorMessage,
    setActiveTagAutocomplete,
  });
}