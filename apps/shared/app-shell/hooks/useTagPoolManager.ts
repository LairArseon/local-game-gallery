import { useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';

type TagAutocompleteState = {
  scope: 'pool' | 'filter' | 'metadata';
  index: number;
  highlighted: number;
} | null;

type MetadataLike = {
  tags: string[];
};

type GameLike<TMetadata extends MetadataLike> = {
  path: string;
  name: string;
  metadata: TMetadata;
};

type ConfigLike = {
  tagPool: string[];
  tagPoolUsage?: Record<string, number>;
};

type GalleryClientLike<TConfig extends ConfigLike, TGame extends GameLike<TMetadata>, TMetadata extends MetadataLike> = {
  saveConfig: (config: TConfig) => Promise<TConfig>;
  saveGameMetadata: (payload: {
    gamePath: string;
    title: string;
    metadata: TMetadata;
  }) => Promise<unknown>;
};

type UseTagPoolManagerArgs<TConfig extends ConfigLike, TGame extends GameLike<TMetadata>, TMetadata extends MetadataLike> = {
  galleryClient: GalleryClientLike<TConfig, TGame, TMetadata>;
  computeTagPoolUsage: (tagPool: string[], games: TGame[]) => Record<string, number>;
  normalizeMetadataTags: (tags: string[]) => string[];
  normalizeTagPool: (tags: string[]) => string[];
  config: TConfig | null;
  setConfig: Dispatch<SetStateAction<TConfig | null>>;
  games: TGame[];
  refreshScan: () => Promise<{ games: TGame[] } | null | unknown>;
  setStatus: Dispatch<SetStateAction<string>>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
  setActiveTagAutocomplete: Dispatch<SetStateAction<TagAutocompleteState>>;
};

export function useTagPoolManager<TConfig extends ConfigLike, TGame extends GameLike<TMetadata>, TMetadata extends MetadataLike>({
  galleryClient,
  computeTagPoolUsage,
  normalizeMetadataTags,
  normalizeTagPool,
  config,
  setConfig,
  games,
  refreshScan,
  setStatus,
  logAppEvent,
  toErrorMessage,
  setActiveTagAutocomplete,
}: UseTagPoolManagerArgs<TConfig, TGame, TMetadata>) {
  const { t } = useTranslation();

  const [activeTagPoolEditorIndex, setActiveTagPoolEditorIndex] = useState<number | null>(null);
  const [tagPoolEditorOriginalValue, setTagPoolEditorOriginalValue] = useState('');

  function tagExistsInAnyGame(tag: string) {
    const normalized = tag.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    return games.some((game) =>
      game.metadata.tags.some((entry) => entry.trim().toLowerCase() === normalized),
    );
  }

  async function persistTagPool(
    nextPool: string[],
    successMessage?: string,
    baseConfig?: TConfig | null,
    usageGames?: TGame[],
  ) {
    const configSnapshot = baseConfig ?? config;
    if (!configSnapshot) {
      return;
    }

    const normalizedPool = normalizeTagPool(nextPool);
    const normalizedUsage = usageGames
      ? computeTagPoolUsage(normalizedPool, usageGames)
      : Object.fromEntries(
          normalizedPool.map((tag) => [tag, configSnapshot.tagPoolUsage?.[tag] ?? 0]),
        );

    try {
      const savedConfig = await galleryClient.saveConfig({
        ...configSnapshot,
        tagPool: normalizedPool,
        tagPoolUsage: normalizedUsage,
      } as TConfig);
      setConfig(savedConfig);
      if (successMessage) {
        setStatus(successMessage);
      }
    } catch (error) {
      const logMessage = toErrorMessage(error, 'Failed to save tag pool.');
      setStatus(t('status.failedSaveTagPool'));
      void logAppEvent(logMessage, 'error', 'save-tag-pool');
    }
  }

  async function removeTagFromPoolByIndex(index: number) {
    if (!config) {
      return;
    }

    const candidate = config.tagPool[index] ?? '';
    if (tagExistsInAnyGame(candidate)) {
      setStatus(t('status.cannotRemoveTagInUse', { tag: candidate }));
      return;
    }

    await persistTagPool(config.tagPool.filter((_, tagIndex) => tagIndex !== index));
  }

  async function finalizeTagPoolEdit(index: number) {
    if (!config) {
      return;
    }

    const currentValue = (config.tagPool[index] ?? '').trim();
    if (!currentValue) {
      const original = tagPoolEditorOriginalValue.trim();
      if (original && tagExistsInAnyGame(original)) {
        const restoredPool = config.tagPool.map((entry, tagIndex) => (tagIndex === index ? original : entry));
        setConfig({ ...config, tagPool: restoredPool });
        setStatus(t('status.cannotRemoveTagInUse', { tag: original }));
        setActiveTagPoolEditorIndex(null);
        setActiveTagAutocomplete(null);
        return;
      }

      const nextPool = config.tagPool.filter((_, tagIndex) => tagIndex !== index);
      setConfig({ ...config, tagPool: nextPool });
      await persistTagPool(nextPool, undefined, config);
      setActiveTagPoolEditorIndex(null);
      setActiveTagAutocomplete(null);
      return;
    }

    const originalValue = tagPoolEditorOriginalValue.trim();
    const nextPool = config.tagPool.map((entry, tagIndex) => (tagIndex === index ? currentValue : entry));
    setConfig({ ...config, tagPool: nextPool });

    const isRename = Boolean(originalValue) && originalValue.toLowerCase() !== currentValue.toLowerCase();
    if (!isRename) {
      await persistTagPool(nextPool, undefined, config);
      setActiveTagPoolEditorIndex(null);
      setActiveTagAutocomplete(null);
      return;
    }

    try {
      const sourceKey = originalValue.toLowerCase();
      const targetTag = currentValue;
      const gamesToUpdate = games.filter((game) =>
        game.metadata.tags.some((tag) => tag.trim().toLowerCase() === sourceKey),
      );

      await Promise.all(
        gamesToUpdate.map((game) => {
          const nextTags = normalizeMetadataTags(
            game.metadata.tags.map((tag) => (tag.trim().toLowerCase() === sourceKey ? targetTag : tag)),
          );

          return galleryClient.saveGameMetadata({
            gamePath: game.path,
            title: game.name,
            metadata: {
              ...game.metadata,
              tags: nextTags,
            },
          });
        }),
      );

      const updatedScan = await refreshScan();
      const refreshedGames = updatedScan && typeof updatedScan === 'object' && 'games' in updatedScan
        ? ((updatedScan as { games?: TGame[] }).games ?? games)
        : games;
      await persistTagPool(nextPool, undefined, config, refreshedGames);
    } catch (error) {
      const logMessage = toErrorMessage(error, 'Failed to propagate tag rename to games.');
      setStatus(t('status.failedRenameTag'));
      void logAppEvent(logMessage, 'error', 'rename-tag-pool');
    }

    setActiveTagPoolEditorIndex(null);
    setActiveTagAutocomplete(null);
  }

  function startTagPoolEdit(index: number) {
    if (!config) {
      return;
    }

    setTagPoolEditorOriginalValue(config.tagPool[index] ?? '');
    setActiveTagPoolEditorIndex(index);
    setActiveTagAutocomplete({ scope: 'pool', index, highlighted: 0 });
  }

  function updateTagPoolEditorValue(index: number, value: string) {
    setConfig((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        tagPool: current.tagPool.map((entry, tagIndex) => (tagIndex === index ? value : entry)),
      };
    });
  }

  function addTagToPool() {
    if (!config) {
      return;
    }

    const nextIndex = config.tagPool.length;
    const nextPool = [...config.tagPool, ''];
    setConfig({ ...config, tagPool: nextPool });
    setTagPoolEditorOriginalValue('');
    setActiveTagPoolEditorIndex(nextIndex);
    setActiveTagAutocomplete({ scope: 'pool', index: nextIndex, highlighted: 0 });
  }

  return {
    activeTagPoolEditorIndex,
    persistTagPool,
    removeTagFromPoolByIndex,
    finalizeTagPoolEdit,
    startTagPoolEdit,
    updateTagPoolEditorValue,
    addTagToPool,
    setActiveTagPoolEditorIndex,
  };
}
