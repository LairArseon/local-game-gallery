/**
 * Owns metadata modal lifecycle and persistence logic.
 *
 * The hook builds editable drafts, handles modal open/close transitions, saves
 * metadata to disk, and merges newly introduced tags into the global tag pool.
 * It also resets metadata autocomplete/editor state to avoid stale editing
 * context when switching games.
 *
 * New to this project: this hook manages metadata drafts and save flow; start with openMetadataModal and saveMetadataChanges for end-to-end behavior.
 */
import { useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { useGalleryClient } from '../client/context';
import type { GalleryConfig, GameMetadata, GameSummary } from '../types';
import { normalizeTagPool } from '../utils/app-helpers';

type TagAutocompleteState = {
  scope: 'pool' | 'filter' | 'metadata';
  index: number;
  highlighted: number;
} | null;

type UseMetadataManagerArgs = {
  config: GalleryConfig | null;
  setConfig: Dispatch<SetStateAction<GalleryConfig | null>>;
  games: GameSummary[];
  setStatus: Dispatch<SetStateAction<string>>;
  refreshScan: () => Promise<unknown>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
  setActiveTagAutocomplete: Dispatch<SetStateAction<TagAutocompleteState>>;
};

export function useMetadataManager({
  config,
  setConfig,
  games,
  setStatus,
  refreshScan,
  logAppEvent,
  toErrorMessage,
  setActiveTagAutocomplete,
}: UseMetadataManagerArgs) {
  const { t } = useTranslation();
  const galleryClient = useGalleryClient();

  const [metadataModalGamePath, setMetadataModalGamePath] = useState<string | null>(null);
  const [metadataDraft, setMetadataDraft] = useState<GameMetadata | null>(null);
  const [isMetadataSaving, setIsMetadataSaving] = useState(false);
  const [activeMetadataTagEditorIndex, setActiveMetadataTagEditorIndex] = useState<number | null>(null);

  function openMetadataModal(gamePath: string) {
    const game = games.find((candidate) => candidate.path === gamePath);
    if (!game) {
      return;
    }

    // Copy editable arrays/objects so modal edits do not mutate scanned state references.
    setMetadataDraft({
      latestVersion: game.metadata.latestVersion,
      score: game.metadata.score,
      status: game.metadata.status,
      description: game.metadata.description,
      notes: [...game.metadata.notes],
      tags: [...game.metadata.tags],
      launchExecutable: game.metadata.launchExecutable,
      customTags: game.metadata.customTags.map((tag) => ({ ...tag })),
    });
    setActiveMetadataTagEditorIndex(null);
    setActiveTagAutocomplete(null);
    setMetadataModalGamePath(gamePath);
  }

  function closeMetadataModal() {
    setMetadataModalGamePath(null);
    setActiveMetadataTagEditorIndex(null);
    // Clear only metadata autocomplete context; leave other panel autocomplete untouched.
    setActiveTagAutocomplete((current) => (current?.scope === 'metadata' ? null : current));
  }

  async function saveMetadataChanges() {
    const game = games.find((candidate) => candidate.path === metadataModalGamePath);
    if (!game || !metadataDraft) {
      return;
    }

    const normalizedMetadataTags = normalizeTagPool(metadataDraft.tags);

    setIsMetadataSaving(true);
    try {
      await galleryClient.saveGameMetadata({
        gamePath: game.path,
        title: game.name,
        metadata: {
          ...metadataDraft,
          // Keep at least one editable note row available after reload.
          notes: metadataDraft.notes.length ? metadataDraft.notes : [''],
          tags: normalizedMetadataTags,
        },
      });

      if (config) {
        const existingKeys = new Set(config.tagPool.map((tag) => tag.trim().toLowerCase()).filter(Boolean));
        const missingTags = normalizedMetadataTags.filter((tag) => !existingKeys.has(tag.toLowerCase()));
        if (missingTags.length) {
          const nextTagPool = [...config.tagPool, ...missingTags];
          const nextUsage = { ...config.tagPoolUsage };
          // New tags start with zero usage until the next scan recomputes counts.
          for (const tag of missingTags) {
            nextUsage[tag] = nextUsage[tag] ?? 0;
          }

          const savedConfig = await galleryClient.saveConfig({
            ...config,
            tagPool: nextTagPool,
            tagPoolUsage: nextUsage,
          });
          setConfig(savedConfig);
        }
      }

      await refreshScan();
      closeMetadataModal();
      setStatus(t('status.metadataSaved'));
    } catch (error) {
      const logMessage = toErrorMessage(error, 'Failed to save metadata.');
      setStatus(t('status.failedSaveMetadata'));
      void logAppEvent(logMessage, 'error', 'save-metadata');
    } finally {
      setIsMetadataSaving(false);
    }
  }

  return {
    metadataModalGamePath,
    metadataDraft,
    isMetadataSaving,
    activeMetadataTagEditorIndex,
    setMetadataDraft,
    setActiveMetadataTagEditorIndex,
    openMetadataModal,
    closeMetadataModal,
    saveMetadataChanges,
  };
}






