/**
 * Shared filtering domain core: staged/applied filters, preset persistence, and projection.
 */
import { useEffect, useMemo, useState } from 'react';
import type {
  FilterOrderByModeLike,
  FilterPresetLike,
  GalleryConfigLike,
  GameSummaryLike,
  UseFilterManagerCoreArgs,
} from '../types/filterManagerTypes';

function normalizeStatusSelection(status: unknown, statusChoices: string[]): string[] {
  const rawValues = Array.isArray(status)
    ? status
    : typeof status === 'string'
      ? [status]
      : [];

  const normalizedChoices = statusChoices
    .map((choice) => choice.trim())
    .filter(Boolean);

  if (normalizedChoices.length === 0) {
    return [...new Set(rawValues
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean))];
  }

  const choicesByKey = new Map(normalizedChoices.map((choice) => [choice.toLowerCase(), choice]));
  const normalized = rawValues
    .filter((value): value is string => typeof value === 'string')
    .map((value) => choicesByKey.get(value.trim().toLowerCase()) ?? null)
    .filter((value): value is string => Boolean(value));

  const deduped = [...new Set(normalized)];
  return deduped.length >= normalizedChoices.length ? [] : deduped;
}

export function useFilterManagerCore<
  TOrderBy extends FilterOrderByModeLike,
  TPreset extends FilterPresetLike<TOrderBy>,
  TConfig extends GalleryConfigLike<TOrderBy, TPreset>,
  TGame extends GameSummaryLike,
>({
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
  isSizeOrderingEnabled = false,
  saveConfig,
}: UseFilterManagerCoreArgs<TOrderBy, TPreset, TConfig, TGame>) {
  const [draftTagRules, setDraftTagRules] = useState<string[]>([]);
  const [activeFilterRuleEditorIndex, setActiveFilterRuleEditorIndex] = useState<number | null>(null);
  const [draftMinScore, setDraftMinScore] = useState('');
  const [draftStatus, setDraftStatus] = useState<string[]>([]);
  const [draftOrderBy, setDraftOrderBy] = useState<TOrderBy>('alpha-asc' as TOrderBy);
  const [isPresetNamingOpen, setIsPresetNamingOpen] = useState(false);
  const [draftPresetName, setDraftPresetName] = useState('');
  const [isPresetSaving, setIsPresetSaving] = useState(false);

  const [appliedTagRules, setAppliedTagRules] = useState<string[]>([]);
  const [appliedMinScore, setAppliedMinScore] = useState<number | null>(null);
  const [appliedStatus, setAppliedStatus] = useState<string[]>([]);
  const [appliedOrderBy, setAppliedOrderBy] = useState<TOrderBy>('alpha-asc' as TOrderBy);

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
    setDraftStatus([]);
    setDraftOrderBy('alpha-asc' as TOrderBy);
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

    const preset = {
      name,
      tagRules: normalizeTagRules(draftTagRules),
      minScore: draftMinScore.trim(),
      status: normalizeStatusSelection(draftStatus, config.statusChoices),
      orderBy: draftOrderBy,
    } as TPreset;

    const nextPresets = [
      ...config.filterPresets.filter((entry) => entry.name.toLowerCase() !== name.toLowerCase()),
      preset,
    ];

    setIsPresetSaving(true);
    try {
      const savedConfig = await saveConfig({
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

  function loadFilterPresetToDraft(preset: TPreset) {
    setDraftTagRules([...preset.tagRules]);
    setDraftMinScore(preset.minScore);
    setDraftStatus(normalizeStatusSelection((preset as { status?: unknown }).status, config?.statusChoices ?? []));
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

    const nextPreset: TPreset = {
      ...sourcePreset,
      name: nextName,
    };

    const nextPresets = [
      ...config.filterPresets.filter((entry) => entry.name !== currentName && entry.name.toLowerCase() !== nextName.toLowerCase()),
      nextPreset,
    ];

    try {
      const savedConfig = await saveConfig({
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
      const savedConfig = await saveConfig({
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
    const normalizedRules = normalizeTagRules(draftTagRules);
    setAppliedTagRules(normalizedRules);

    const parsedMinScore = Number.parseFloat(draftMinScore);
    setAppliedMinScore(Number.isFinite(parsedMinScore) ? parsedMinScore : null);

    setAppliedStatus(normalizeStatusSelection(draftStatus, config?.statusChoices ?? []));
    const isSizeSort = draftOrderBy === 'size-asc' || draftOrderBy === 'size-desc';
    if (isSizeSort && !isSizeOrderingEnabled) {
      setAppliedOrderBy('alpha-asc' as TOrderBy);
      return;
    }

    setAppliedOrderBy(draftOrderBy);
  }, [draftTagRules, draftMinScore, draftStatus, draftOrderBy, normalizeTagRules, isSizeOrderingEnabled, config]);

  const filteredGames = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const includeTags = appliedTagRules
      .filter((rule) => !rule.startsWith('-'))
      .map((rule) => rule.toLowerCase());
    const excludeTags = appliedTagRules
      .filter((rule) => rule.startsWith('-'))
      .map((rule) => rule.slice(1).trim().toLowerCase())
      .filter(Boolean);
    const appliedStatusKeys = new Set(appliedStatus.map((status) => status.trim().toLowerCase()).filter(Boolean));

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

      if (includeTags.some((tag) => !gameTags.has(tag))) {
        return false;
      }

      if (excludeTags.some((tag) => gameTags.has(tag))) {
        return false;
      }

      if (appliedMinScore !== null && normalizedScore(game.metadata.score) < appliedMinScore) {
        return false;
      }

      if (appliedStatusKeys.size > 0 && !appliedStatusKeys.has(game.metadata.status.trim().toLowerCase())) {
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
      if (appliedOrderBy === 'score-asc' || appliedOrderBy === 'score-desc') {
        if (leftScore !== rightScore) {
          return appliedOrderBy === 'score-asc' ? leftScore - rightScore : rightScore - leftScore;
        }

        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
      }

      if (appliedOrderBy === 'size-asc' || appliedOrderBy === 'size-desc') {
        const leftSize = Number.isFinite(left.sizeBytes) ? Number(left.sizeBytes) : Number.POSITIVE_INFINITY;
        const rightSize = Number.isFinite(right.sizeBytes) ? Number(right.sizeBytes) : Number.POSITIVE_INFINITY;

        if (leftSize !== rightSize) {
          return appliedOrderBy === 'size-asc' ? leftSize - rightSize : rightSize - leftSize;
        }

        if (leftScore !== rightScore) {
          return rightScore - leftScore;
        }

        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
      }

      if (appliedOrderBy === 'playtime-asc' || appliedOrderBy === 'playtime-desc') {
        const leftPlaytime = Number.isFinite(left.accumulatedPlaytimeSeconds)
          ? Number(left.accumulatedPlaytimeSeconds)
          : 0;
        const rightPlaytime = Number.isFinite(right.accumulatedPlaytimeSeconds)
          ? Number(right.accumulatedPlaytimeSeconds)
          : 0;

        if (leftPlaytime !== rightPlaytime) {
          return appliedOrderBy === 'playtime-asc'
            ? leftPlaytime - rightPlaytime
            : rightPlaytime - leftPlaytime;
        }

        return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
      }

      return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
    });

    return sorted;
  }, [games, searchQuery, appliedTagRules, appliedMinScore, appliedStatus, appliedOrderBy, normalizedScore]);

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

