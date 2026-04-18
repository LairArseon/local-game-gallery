import { useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';

type TagAutocompleteState = {
  scope: 'pool' | 'filter' | 'metadata';
  index: number;
  highlighted: number;
} | null;

type GameMetadataLike = {
  latestVersion: string;
  score: string;
  status: string;
  description: string;
  notes: string[];
  tags: string[];
  launchExecutable: string;
  customTags: Array<{ key: string; value: string }>;
};

type GameSummaryLike<TMetadata extends GameMetadataLike> = {
  path: string;
  name: string;
  metadata: TMetadata;
};

type GalleryConfigLike = {
  tagPool: string[];
  tagPoolUsage: Record<string, number>;
};

type GalleryClientLike<TConfig extends GalleryConfigLike, TMetadata extends GameMetadataLike> = {
  saveGameMetadata: (payload: {
    gamePath: string;
    title: string;
    metadata: TMetadata;
  }) => Promise<unknown>;
  saveConfig: (config: TConfig) => Promise<TConfig>;
};

type RefreshMetadataArgs = {
  gamePath: string;
  refreshScan: () => Promise<unknown>;
  refreshGame?: (gamePath: string) => Promise<unknown>;
  toErrorMessage: (error: unknown, fallback: string) => string;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
};

type UseMetadataManagerArgs<
  TConfig extends GalleryConfigLike,
  TMetadata extends GameMetadataLike,
  TGame extends GameSummaryLike<TMetadata>,
> = {
  galleryClient: GalleryClientLike<TConfig, TMetadata>;
  normalizeTagPool: (tags: string[]) => string[];
  config: TConfig | null;
  setConfig: Dispatch<SetStateAction<TConfig | null>>;
  games: TGame[];
  setStatus: Dispatch<SetStateAction<string>>;
  refreshScan: () => Promise<unknown>;
  refreshGame?: (gamePath: string) => Promise<unknown>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
  setActiveTagAutocomplete: Dispatch<SetStateAction<TagAutocompleteState>>;
  refreshAfterMetadataSave?: (args: RefreshMetadataArgs) => void | Promise<void>;
};

function defaultRefreshAfterMetadataSave({ gamePath, refreshScan, refreshGame, toErrorMessage, logAppEvent }: RefreshMetadataArgs) {
  if (!refreshGame) {
    void refreshScan();
    return;
  }

  void refreshGame(gamePath).then((result) => {
    if (result) {
      return;
    }

    return refreshScan();
  }).catch((error) => {
    const logMessage = toErrorMessage(error, 'Background metadata refresh failed.');
    void logAppEvent(logMessage, 'warn', 'save-metadata-refresh');
  });
}

export function useMetadataManager<
  TConfig extends GalleryConfigLike,
  TMetadata extends GameMetadataLike,
  TGame extends GameSummaryLike<TMetadata>,
>({
  galleryClient,
  normalizeTagPool,
  config,
  setConfig,
  games,
  setStatus,
  refreshScan,
  refreshGame,
  logAppEvent,
  toErrorMessage,
  setActiveTagAutocomplete,
  refreshAfterMetadataSave = defaultRefreshAfterMetadataSave,
}: UseMetadataManagerArgs<TConfig, TMetadata, TGame>) {
  const { t } = useTranslation();

  const [metadataModalGamePath, setMetadataModalGamePath] = useState<string | null>(null);
  const [metadataDraft, setMetadataDraft] = useState<TMetadata | null>(null);
  const [isMetadataSaving, setIsMetadataSaving] = useState(false);
  const [activeMetadataTagEditorIndex, setActiveMetadataTagEditorIndex] = useState<number | null>(null);

  function openMetadataModal(gamePath: string) {
    const game = games.find((candidate) => candidate.path === gamePath);
    if (!game) {
      return;
    }

    setMetadataDraft({
      latestVersion: game.metadata.latestVersion,
      score: game.metadata.score,
      status: game.metadata.status,
      description: game.metadata.description,
      notes: [...game.metadata.notes],
      tags: [...game.metadata.tags],
      launchExecutable: game.metadata.launchExecutable,
      customTags: game.metadata.customTags.map((tag) => ({ ...tag })),
    } as TMetadata);
    setActiveMetadataTagEditorIndex(null);
    setActiveTagAutocomplete(null);
    setMetadataModalGamePath(gamePath);
  }

  function closeMetadataModal() {
    setMetadataModalGamePath(null);
    setActiveMetadataTagEditorIndex(null);
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
          for (const tag of missingTags) {
            nextUsage[tag] = nextUsage[tag] ?? 0;
          }

          const savedConfig = await galleryClient.saveConfig({
            ...config,
            tagPool: nextTagPool,
            tagPoolUsage: nextUsage,
          } as TConfig);
          setConfig(savedConfig);
        }
      }

      closeMetadataModal();
      setStatus(t('status.metadataSaved'));
      await refreshAfterMetadataSave({
        gamePath: game.path,
        refreshScan,
        refreshGame,
        toErrorMessage,
        logAppEvent,
      });
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
