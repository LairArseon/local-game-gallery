/**
 * Shared type contracts for filter manager core.
 */
import type { Dispatch, SetStateAction } from 'react';

export type TagAutocompleteState = {
  scope: 'pool' | 'filter' | 'metadata';
  index: number;
  highlighted: number;
} | null;

export type FilterOrderByModeLike = 'alpha-asc' | 'alpha-desc' | 'score-asc' | 'score-desc' | 'size-asc' | 'size-desc';

export type FilterPresetLike<TOrderBy extends FilterOrderByModeLike> = {
  name: string;
  tagRules: string[];
  minScore: string;
  status: string;
  orderBy: TOrderBy;
};

export type GalleryConfigLike<
  TOrderBy extends FilterOrderByModeLike,
  TPreset extends FilterPresetLike<TOrderBy>,
> = {
  tagPool: string[];
  tagPoolUsage: Record<string, number>;
  filterPresets: TPreset[];
};

export type GameSummaryLike = {
  name: string;
  sizeBytes?: number | null;
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
