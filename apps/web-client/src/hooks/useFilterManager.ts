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
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { useGalleryClient } from '../client/context';
import type { FilterOrderByMode, FilterPreset, GalleryConfig, GameSummary } from '../types';
import { normalizeTagRules, normalizedScore } from '../utils/app-helpers';

type TagAutocompleteState = {
  scope: 'pool' | 'filter' | 'metadata';
  index: number;
  highlighted: number;
} | null;

type UseFilterManagerArgs = {
  config: GalleryConfig | null;
  setConfig: Dispatch<SetStateAction<GalleryConfig | null>>;
  games: GameSummary[];
  tagPoolUsageOverride?: Record<string, number> | null;
  searchQuery: string;
  setStatus: Dispatch<SetStateAction<string>>;
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
  logAppEvent,
  toErrorMessage,
  setActiveTagAutocomplete,
}: UseFilterManagerArgs) {
  const { t } = useTranslation();
  const galleryClient = useGalleryClient();

  const [draftTagRules, setDraftTagRules] = useState<string[]>([]);
  const [activeFilterRuleEditorIndex, setActiveFilterRuleEditorIndex] = useState<number | null>(null);
  const [draftMinScore, setDraftMinScore] = useState('');
  const [draftStatus, setDraftStatus] = useState('');
  const [draftOrderBy, setDraftOrderBy] = useState<FilterOrderByMode>('alpha-asc');
  const [isPresetNamingOpen, setIsPresetNamingOpen] = useState(false);
  const [draftPresetName, setDraftPresetName] = useState('');
  const [isPresetSaving, setIsPresetSaving] = useState(false);

  const [appliedTagRules, setAppliedTagRules] = useState<string[]>([]);
  const [appliedMinScore, setAppliedMinScore] = useState<number | null>(null);
  const [appliedStatus, setAppliedStatus] = useState('');
  const [appliedOrderBy, setAppliedOrderBy] = useState<FilterOrderByMode>('alpha-asc');

  const topUsedFilterSuggestions = useMemo(() => {
    if (!config) {
      return [] as Array<{ tag: string; count: number }>;
    }

    const activeKeys = new Set(
      draftTagRules
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => (entry.startsWith('-') ? entry.slice(1).trim() : entry).toLowerCase()),
    );

    return config.tagPool
      .map((tag) => ({
        tag,
        count: Number.isFinite((tagPoolUsageOverride ?? config.tagPoolUsage)?.[tag])
          ? ((tagPoolUsageOverride ?? config.tagPoolUsage)?.[tag] ?? 0)
          : 0,
      }))
      .filter((entry) => !activeKeys.has(entry.tag.toLowerCase()))
      .sort((left, right) => {
        if (left.count !== right.count) {
          return right.count - left.count;
        }

        return left.tag.localeCompare(right.tag, undefined, { sensitivity: 'base' });
      })
      .slice(0, 10);
  }, [config, draftTagRules, tagPoolUsageOverride]);

  function resetStagedFilters() {
    setDraftTagRules([]);
    setActiveFilterRuleEditorIndex(null);
    setActiveTagAutocomplete(null);
    setDraftMinScore('');
    setDraftStatus('');
    setDraftOrderBy('alpha-asc');
  }

  function beginSavePreset() {
    setDraftPresetName('');
    setIsPresetNamingOpen(true);
  }

  async function saveCurrentFilterPreset() {
    if (!config || isPresetSaving) {
      return;
    }

    const name = draftPresetName.trim();
    if (!name) {
      setStatus(t('status.presetNameRequired'));
      return;
    }

    const preset: FilterPreset = {
      name,
      tagRules: normalizeTagRules(draftTagRules),
      minScore: draftMinScore.trim(),
      status: draftStatus,
      orderBy: draftOrderBy,
    };

    const nextPresets = [
      ...config.filterPresets.filter((entry) => entry.name.toLowerCase() !== name.toLowerCase()),
      preset,
    ];

    setIsPresetSaving(true);
    try {
      const savedConfig = await galleryClient.saveConfig({
        ...config,
        filterPresets: nextPresets,
      });
      setConfig(savedConfig);
      setDraftPresetName('');
      setIsPresetNamingOpen(false);
      setStatus(t('status.filterPresetSaved', { name }));
    } catch (error) {
      const logMessage = toErrorMessage(error, 'Failed to save filter preset.');
      setStatus(t('status.failedSaveFilterPreset'));
      void logAppEvent(logMessage, 'error', 'save-filter-preset');
    } finally {
      setIsPresetSaving(false);
    }
  }

  function loadFilterPresetToDraft(preset: FilterPreset) {
    setDraftTagRules([...preset.tagRules]);
    setDraftMinScore(preset.minScore);
    setDraftStatus(preset.status ?? '');
    setDraftOrderBy(preset.orderBy);
  }

  async function renameFilterPreset(currentName: string, nextNameRaw: string) {
    if (!config) {
      return;
    }

    const nextName = nextNameRaw.trim();
    if (!nextName || nextName.toLowerCase() === currentName.trim().toLowerCase()) {
      return;
    }

    const sourcePreset = config.filterPresets.find((entry) => entry.name === currentName);
    if (!sourcePreset) {
      return;
    }

    const nextPreset: FilterPreset = {
      ...sourcePreset,
      name: nextName,
    };

    const nextPresets = [
      ...config.filterPresets.filter((entry) => entry.name !== currentName && entry.name.toLowerCase() !== nextName.toLowerCase()),
      nextPreset,
    ];

    try {
      const savedConfig = await galleryClient.saveConfig({
        ...config,
        filterPresets: nextPresets,
      });
      setConfig(savedConfig);
      setStatus(t('status.filterPresetRenamed', { currentName, nextName }));
    } catch (error) {
      const logMessage = toErrorMessage(error, 'Failed to rename filter preset.');
      setStatus(t('status.failedRenameFilterPreset'));
      void logAppEvent(logMessage, 'error', 'rename-filter-preset');
    }
  }

  async function deleteFilterPreset(name: string) {
    if (!config) {
      return;
    }

    try {
      const savedConfig = await galleryClient.saveConfig({
        ...config,
        filterPresets: config.filterPresets.filter((entry) => entry.name !== name),
      });
      setConfig(savedConfig);
      setStatus(t('status.removedPreset', { name }));
    } catch (error) {
      const logMessage = toErrorMessage(error, 'Failed to delete filter preset.');
      setStatus(t('status.failedDeleteFilterPreset'));
      void logAppEvent(logMessage, 'error', 'delete-filter-preset');
    }
  }

  useEffect(() => {
    // Filters now apply immediately as users edit staged controls.
    const normalizedRules = normalizeTagRules(draftTagRules);
    setAppliedTagRules(normalizedRules);

    const parsedMinScore = Number.parseFloat(draftMinScore);
    setAppliedMinScore(Number.isFinite(parsedMinScore) ? parsedMinScore : null);

    setAppliedStatus(draftStatus.trim());
    setAppliedOrderBy(draftOrderBy);
  }, [draftTagRules, draftMinScore, draftStatus, draftOrderBy]);

  const filteredGames = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const includeTags = appliedTagRules
      .filter((rule) => !rule.startsWith('-'))
      .map((rule) => rule.toLowerCase());
    const excludeTags = appliedTagRules
      .filter((rule) => rule.startsWith('-'))
      .map((rule) => rule.slice(1).trim().toLowerCase())
      .filter(Boolean);

    const filtered = games.filter((game) => {
      if (query) {
        const matchesQuery = game.name.toLowerCase().includes(query)
          || game.versions.some((version) => version.name.toLowerCase().includes(query))
          || game.metadata.tags.some((tag) => tag.toLowerCase().includes(query));
        if (!matchesQuery) {
          return false;
        }
      }

      const gameTags = new Set(game.metadata.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean));

      // Include rules are ANDed: the game must contain every required tag.
      if (includeTags.some((tag) => !gameTags.has(tag))) {
        return false;
      }

      // Exclude rules are ORed: any forbidden tag removes the game.
      if (excludeTags.some((tag) => gameTags.has(tag))) {
        return false;
      }

      if (appliedMinScore !== null && normalizedScore(game.metadata.score) < appliedMinScore) {
        return false;
      }

      if (appliedStatus && game.metadata.status.trim().toLowerCase() !== appliedStatus.trim().toLowerCase()) {
        return false;
      }

      return true;
    });

    const sorted = [...filtered];
    sorted.sort((left, right) => {
      if (appliedOrderBy === 'alpha-asc') {
        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
      }

      if (appliedOrderBy === 'alpha-desc') {
        return right.name.localeCompare(left.name, undefined, { sensitivity: 'base' });
      }

      const leftScore = normalizedScore(left.metadata.score);
      const rightScore = normalizedScore(right.metadata.score);
      if (leftScore !== rightScore) {
        return appliedOrderBy === 'score-asc' ? leftScore - rightScore : rightScore - leftScore;
      }

      // Deterministic secondary sort avoids flicker when scores are equal.
      return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
    });

    return sorted;
  }, [games, searchQuery, appliedTagRules, appliedMinScore, appliedStatus, appliedOrderBy]);

  return {
    draftTagRules,
    activeFilterRuleEditorIndex,
    draftMinScore,
    draftStatus,
    draftOrderBy,
    isPresetNamingOpen,
    draftPresetName,
    isPresetSaving,
    topUsedFilterSuggestions,
    filteredGames,
    setDraftTagRules,
    setActiveFilterRuleEditorIndex,
    setDraftMinScore,
    setDraftStatus,
    setDraftOrderBy,
    setIsPresetNamingOpen,
    setDraftPresetName,
    resetStagedFilters,
    beginSavePreset,
    saveCurrentFilterPreset,
    loadFilterPresetToDraft,
    renameFilterPreset,
    deleteFilterPreset,
  };
}






