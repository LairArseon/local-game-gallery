import { type Dispatch, type SetStateAction } from 'react';
import { useGalleryClient } from '../client/context';
import { useTagPoolManager as useSharedTagPoolManager } from '../../../shared/app-shell/hooks/useTagPoolManager';
import type { GalleryConfig, GameSummary } from '../types';
import { computeTagPoolUsage, normalizeMetadataTags, normalizeTagPool } from '../utils/app-helpers';

type TagAutocompleteState = {
  scope: 'pool' | 'filter' | 'metadata';
  index: number;
  highlighted: number;
} | null;

type UseTagPoolManagerArgs = {
  config: GalleryConfig | null;
  setConfig: Dispatch<SetStateAction<GalleryConfig | null>>;
  games: GameSummary[];
  refreshScan: () => Promise<{ games: GameSummary[] } | null | unknown>;
  setStatus: Dispatch<SetStateAction<string>>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
  setActiveTagAutocomplete: Dispatch<SetStateAction<TagAutocompleteState>>;
};

export function useTagPoolManager(args: UseTagPoolManagerArgs) {
  const galleryClient = useGalleryClient();
  return useSharedTagPoolManager<GalleryConfig, GameSummary, GameSummary['metadata']>({
    galleryClient,
    computeTagPoolUsage,
    normalizeMetadataTags,
    normalizeTagPool,
    ...args,
  });
}
