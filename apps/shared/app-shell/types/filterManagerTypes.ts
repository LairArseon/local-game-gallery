/**
 * Shared type contracts for filter manager core.
 */
import type { Dispatch, SetStateAction } from 'react';
import type { ModuleTagRule } from '../types';
import type { ResolvedModuleFilter } from '../core/moduleFilters';

export type TagAutocompleteState = {
  scope: 'pool' | 'filter' | 'metadata';
  index: number;
  highlighted: number;
} | null;

export type FilterOrderByModeLike = 'alpha-asc' | 'alpha-desc' | 'score-asc' | 'score-desc' | 'f95-score-asc' | 'f95-score-desc' | 'size-asc' | 'size-desc' | 'playtime-asc' | 'playtime-desc';

export type FilterPresetLike<TOrderBy extends FilterOrderByModeLike> = {
  name: string;
  tagRules: string[];
  moduleTagRules?: ModuleTagRule[];
  minScore: string;
  status: string[];
  orderBy: TOrderBy;
};

export type GalleryConfigLike<
  TOrderBy extends FilterOrderByModeLike,
  TPreset extends FilterPresetLike<TOrderBy>,
> = {
  statusChoices: string[];
  tagPool: string[];
  tagPoolUsage: Record<string, number>;
  filterPresets: TPreset[];
};

export type GameSummaryLike = {
  path: string;
  name: string;
  sizeBytes?: number | null;
  accumulatedPlaytimeSeconds?: number | null;
  versions: Array<{ name: string }>;
  metadata: {
    tags: string[];
    score: unknown;
    status: string;
  };
};

export type LogAppEvent = (
  message: string,
  level?: 'info' | 'warn' | 'error',
  source?: string,
) => Promise<void>;

export type UseFilterManagerCoreArgs<
  TOrderBy extends FilterOrderByModeLike,
  TPreset extends FilterPresetLike<TOrderBy>,
  TConfig extends GalleryConfigLike<TOrderBy, TPreset>,
  TGame extends GameSummaryLike,
> = {
  config: TConfig | null;
  setConfig: Dispatch<SetStateAction<TConfig | null>>;
  games: TGame[];
  moduleFilters?: ResolvedModuleFilter[];
  tagPoolUsageOverride?: Record<string, number> | null;
  searchQuery: string;
  setStatus: Dispatch<SetStateAction<string>>;
  logAppEvent: LogAppEvent;
  toErrorMessage: (error: unknown, fallback: string) => string;
  setActiveTagAutocomplete: Dispatch<SetStateAction<TagAutocompleteState>>;
  t: (key: string, options?: Record<string, unknown>) => string;
  normalizeTagRules: (rules: string[]) => string[];
  normalizedScore: (value: unknown) => number;
  isSizeOrderingEnabled?: boolean;
  saveConfig: (nextConfig: TConfig) => Promise<TConfig>;
};
