import type { KeyboardEvent } from 'react';
import type { FilterOrderByModeLike, FilterPresetLike } from '../types/filterManagerTypes';

export type TopUsedSuggestion = {
  tag: string;
  count: number;
};

export type FilterPanelProps<
  TOrderBy extends FilterOrderByModeLike,
  TPreset extends FilterPresetLike<TOrderBy>,
> = {
  draftTagRules: string[];
  activeFilterRuleEditorIndex: number | null;
  activeTagAutocomplete: {
    scope: 'pool' | 'filter' | 'metadata';
    index: number;
    highlighted: number;
  } | null;
  activeTagSuggestions: string[];
  topUsedFilterSuggestions: TopUsedSuggestion[];
  draftMinScore: string;
  draftOrderBy: TOrderBy;
  draftStatus: string;
  orderByModeLabels: Record<TOrderBy, string>;
  isSizeOrderingEnabled: boolean;
  statusChoices: string[];
  isPresetNamingOpen: boolean;
  draftPresetName: string;
  isPresetSaving: boolean;
  filterPresets: TPreset[];
  onSetActiveTagAutocomplete: (value: {
    scope: 'pool' | 'filter' | 'metadata';
    index: number;
    highlighted: number;
  } | null) => void;
  onStartEditRule: (index: number) => void;
  onRemoveRule: (index: number) => void;
  onFinalizeRuleBlur: (index: number) => void;
  onHandleRuleKeyDown: (event: KeyboardEvent<HTMLInputElement>, index: number) => void;
  onUpdateRule: (index: number, value: string) => void;
  onApplyRuleSuggestion: (index: number, suggestion: string) => void;
  onAddRule: () => void;
  onAddSuggestionTag: (tag: string) => void;
  onChangeDraftMinScore: (value: string) => void;
  onChangeDraftOrderBy: (value: TOrderBy) => void;
  onChangeDraftStatus: (value: string) => void;
  onBeginSavePreset: () => void;
  onChangeDraftPresetName: (value: string) => void;
  onSaveCurrentFilterPreset: () => void;
  onCancelPresetNaming: () => void;
  onRenameFilterPreset: (currentName: string, nextName: string) => void;
  onLoadFilterPreset: (preset: TPreset) => void;
  onDeleteFilterPreset: (name: string) => void;
  onResetStagedFilters: () => void;
};

