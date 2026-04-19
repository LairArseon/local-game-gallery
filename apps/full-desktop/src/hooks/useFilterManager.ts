/**
 * Owns filtering domain state, preset persistence, and result projection logic.
 *
 * The hook separates staged edits from applied filters, computes top tag
 * suggestions, persists named presets, and returns a sorted filtered game list.
 * Centralizing this logic avoids duplicated query/tag/status/score semantics and
 * keeps filter behavior consistent across UI entry points.
 *
 * New to this project: this hook defines filtering semantics (draft vs applied, presets, ordering); start with filteredGames output.
 */
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { useGalleryClient } from '../client/context';
import type { FilterOrderByMode, FilterPreset, GalleryConfig, GameSummary } from '../types';
import { normalizeTagRules, normalizedScore } from '../utils/app-helpers';
import { useFilterManagerCore } from '../../../shared/app-shell/hooks/useFilterManagerCore';
import type { TagAutocompleteState } from '../../../shared/app-shell/types/filterManagerTypes';

type UseFilterManagerArgs = {
  config: GalleryConfig | null;
  setConfig: Dispatch<SetStateAction<GalleryConfig | null>>;
  games: GameSummary[];
  tagPoolUsageOverride?: Record<string, number> | null;
  searchQuery: string;
  setStatus: Dispatch<SetStateAction<string>>;
  isSizeOrderingEnabled?: boolean;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
  setActiveTagAutocomplete: Dispatch<SetStateAction<TagAutocompleteState>>;
};

export function useFilterManager({
  config,
  setConfig,
  games,
  tagPoolUsageOverride,
  searchQuery,
  setStatus,
  isSizeOrderingEnabled,
  logAppEvent,
  toErrorMessage,
  setActiveTagAutocomplete,
}: UseFilterManagerArgs) {
  const { t } = useTranslation();
  const galleryClient = useGalleryClient();
  return useFilterManagerCore<FilterOrderByMode, FilterPreset, GalleryConfig, GameSummary>({
    config,
    setConfig,
    games,
    tagPoolUsageOverride,
    searchQuery,
    setStatus,
    logAppEvent,
    toErrorMessage,
    setActiveTagAutocomplete,
    t,
    normalizeTagRules,
    normalizedScore,
    isSizeOrderingEnabled,
    saveConfig: (nextConfig) => galleryClient.saveConfig(nextConfig),
  });
}







