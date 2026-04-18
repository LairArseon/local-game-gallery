import { useMemo, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react';

type TagScope = 'pool' | 'filter' | 'metadata';

type TagAutocompleteState = {
  scope: TagScope;
  index: number;
  highlighted: number;
} | null;

type ConfigLike = {
  tagPool: string[];
};

type MetadataLike = {
  tags: string[];
};

type UseTagAutocompleteManagerArgs<TConfig extends ConfigLike, TMetadata extends MetadataLike> = {
  config: TConfig | null;
  draftTagRules: string[];
  metadataDraft: TMetadata | null;
  activeTagAutocomplete: TagAutocompleteState;
  setActiveTagAutocomplete: Dispatch<SetStateAction<TagAutocompleteState>>;
  setConfig: Dispatch<SetStateAction<TConfig | null>>;
  setDraftTagRules: Dispatch<SetStateAction<string[]>>;
  setMetadataDraft: Dispatch<SetStateAction<TMetadata | null>>;
  persistTagPool: (nextPool: string[]) => Promise<unknown> | void;
};

export function useTagAutocompleteManager<TConfig extends ConfigLike, TMetadata extends MetadataLike>({
  config,
  draftTagRules,
  metadataDraft,
  activeTagAutocomplete,
  setActiveTagAutocomplete,
  setConfig,
  setDraftTagRules,
  setMetadataDraft,
  persistTagPool,
}: UseTagAutocompleteManagerArgs<TConfig, TMetadata>) {
  const knownTags = useMemo(() => {
    const uniqueTags = new Map<string, string>();

    for (const tag of config?.tagPool ?? []) {
      const normalized = tag.trim();
      if (!normalized) {
        continue;
      }

      const key = normalized.toLowerCase();
      if (!uniqueTags.has(key)) {
        uniqueTags.set(key, normalized);
      }
    }

    if (metadataDraft) {
      for (const tag of metadataDraft.tags) {
        const normalized = tag.trim();
        if (!normalized) {
          continue;
        }

        const key = normalized.toLowerCase();
        if (!uniqueTags.has(key)) {
          uniqueTags.set(key, normalized);
        }
      }
    }

    return [...uniqueTags.values()].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
  }, [config?.tagPool, metadataDraft]);

  const activeTagSuggestions = useMemo(() => {
    if (!activeTagAutocomplete) {
      return [] as string[];
    }

    const sourceValue = activeTagAutocomplete.scope === 'pool'
      ? config?.tagPool[activeTagAutocomplete.index] ?? ''
      : activeTagAutocomplete.scope === 'filter'
        ? draftTagRules[activeTagAutocomplete.index] ?? ''
        : metadataDraft?.tags[activeTagAutocomplete.index] ?? '';

    const withoutPrefix = sourceValue.trim().startsWith('-') ? sourceValue.trim().slice(1).trim() : sourceValue.trim();
    const query = withoutPrefix.toLowerCase();
    if (!query) {
      return knownTags.slice(0, 8);
    }

    return knownTags
      .filter((tag) => tag.toLowerCase().includes(query))
      .slice(0, 8);
  }, [activeTagAutocomplete, config?.tagPool, draftTagRules, metadataDraft, knownTags]);

  function applyTagSuggestion(scope: TagScope, index: number, suggestion: string) {
    if (scope === 'pool') {
      if (!config) {
        return;
      }

      const nextPool = config.tagPool.map((entry, tagIndex) => (tagIndex === index ? suggestion : entry));
      setConfig({ ...config, tagPool: nextPool });
      void persistTagPool(nextPool);
    } else if (scope === 'filter') {
      setDraftTagRules((current) => {
        const existing = current[index] ?? '';
        const prefix = existing.trim().startsWith('-') ? '-' : '';
        return current.map((entry, ruleIndex) => (ruleIndex === index ? `${prefix}${suggestion}` : entry));
      });
    } else {
      setMetadataDraft((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          tags: current.tags.map((entry, tagIndex) => (tagIndex === index ? suggestion : entry)),
        };
      });
    }

    setActiveTagAutocomplete(null);
  }

  function handleTagAutocompleteKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    scope: TagScope,
    index: number,
  ) {
    const isActive = activeTagAutocomplete?.scope === scope && activeTagAutocomplete.index === index;
    if (!isActive || !activeTagSuggestions.length) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveTagAutocomplete((current) => {
        if (!current || current.scope !== scope || current.index !== index) {
          return current;
        }

        return {
          ...current,
          highlighted: (current.highlighted + 1) % activeTagSuggestions.length,
        };
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveTagAutocomplete((current) => {
        if (!current || current.scope !== scope || current.index !== index) {
          return current;
        }

        return {
          ...current,
          highlighted: (current.highlighted - 1 + activeTagSuggestions.length) % activeTagSuggestions.length,
        };
      });
      return;
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      const selected = activeTagSuggestions[activeTagAutocomplete.highlighted] ?? activeTagSuggestions[0];
      if (selected) {
        applyTagSuggestion(scope, index, selected);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setActiveTagAutocomplete(null);
    }
  }

  return {
    activeTagSuggestions,
    applyTagSuggestion,
    handleTagAutocompleteKeyDown,
  };
}
