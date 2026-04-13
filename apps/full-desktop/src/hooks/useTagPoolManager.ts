/**
 * Manages tag-pool editing lifecycle, persistence, and rename propagation.
 *
 * This hook enforces safety checks for removals, normalizes pool/usage writes,
 * and propagates tag renames into game metadata when needed. It also tracks
 * inline editor state (active index and original values) so edits can be
 * finalized or restored predictably.
 *
 * New to this project: this hook controls tag-pool editing lifecycle and rename propagation; inspect finalizeTagPoolEdit and persistence safeguards first.
 */
import { useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { useGalleryClient } from '../client/context';
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

export function useTagPoolManager({
  config,
  setConfig,
  games,
  refreshScan,
  setStatus,
  logAppEvent,
  toErrorMessage,
  setActiveTagAutocomplete,
}: UseTagPoolManagerArgs) {
  const { t } = useTranslation();
  const galleryClient = useGalleryClient();

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
    baseConfig?: GalleryConfig | null,
    usageGames?: GameSummary[],
  ) {
    const configSnapshot = baseConfig ?? config;
    if (!configSnapshot) {
      return;
    }

    const normalizedPool = normalizeTagPool(nextPool);
    // When a caller provides refreshed games, recompute exact usage counts from metadata;
    // otherwise preserve existing usage values for unchanged tags.
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
      });
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
      // Empty edit means delete intent. If the original tag is in use, restore it
      // so the editor cannot accidentally orphan metadata references.
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
      // Rename is persisted in both the pool and every game metadata tag list.
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
      // Prefer usage recomputation from a freshly scanned game list when available.
      const refreshedGames = updatedScan && typeof updatedScan === 'object' && 'games' in updatedScan
        ? ((updatedScan as { games?: GameSummary[] }).games ?? games)
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






