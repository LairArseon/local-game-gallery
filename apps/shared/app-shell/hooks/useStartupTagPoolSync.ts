import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

type GameMetadataLike = {
  tags: string[];
};

type ScanGameLike = {
  metadata: GameMetadataLike;
};

type ScanResultLike<TGame extends ScanGameLike> = {
  scannedAt?: string | null;
  games: TGame[];
};

type TagPoolConfigLike = {
  gamesRoot?: string;
  tagPool?: string[];
  tagPoolUsage?: Record<string, number>;
};

type GalleryClientLike<TConfig extends TagPoolConfigLike> = {
  saveConfig: (config: TConfig) => Promise<TConfig>;
};

type UseStartupTagPoolSyncArgs<TConfig extends TagPoolConfigLike, TGame extends ScanGameLike> = {
  galleryClient: GalleryClientLike<TConfig>;
  config: TConfig | null;
  scanResult: ScanResultLike<TGame>;
  setConfig: Dispatch<SetStateAction<TConfig | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
  normalizeTagPool: (tags: string[]) => string[];
};

export function useStartupTagPoolSync<TConfig extends TagPoolConfigLike, TGame extends ScanGameLike>({
  galleryClient,
  config,
  scanResult,
  setConfig,
  setStatus,
  logAppEvent,
  toErrorMessage,
  normalizeTagPool,
}: UseStartupTagPoolSyncArgs<TConfig, TGame>) {
  const didRunStartupTagPoolSyncRef = useRef(false);

  useEffect(() => {
    if (didRunStartupTagPoolSyncRef.current) {
      return;
    }

    if (!config?.gamesRoot || !scanResult.scannedAt) {
      return;
    }

    didRunStartupTagPoolSyncRef.current = true;

    const startupTagPoolSync = async () => {
      const gameTagSets = scanResult.games.map((game) =>
        new Set(game.metadata.tags.map((tag) => tag.trim()).filter(Boolean).map((tag) => tag.toLowerCase())),
      );
      const usageByKey = new Map<string, number>();
      for (const tagSet of gameTagSets) {
        for (const key of tagSet) {
          usageByKey.set(key, (usageByKey.get(key) ?? 0) + 1);
        }
      }

      const libraryTags = normalizeTagPool(scanResult.games.flatMap((game) => game.metadata.tags));
      const mergedTagPool = normalizeTagPool([...(config.tagPool ?? []), ...libraryTags]);
      const tagPoolUsage = Object.fromEntries(
        mergedTagPool.map((tag) => [tag, usageByKey.get(tag.toLowerCase()) ?? 0]),
      );

      const isTagPoolSame = JSON.stringify(mergedTagPool) === JSON.stringify(config.tagPool ?? []);
      const isUsageSame = JSON.stringify(tagPoolUsage) === JSON.stringify(config.tagPoolUsage ?? {});
      if (isTagPoolSame && isUsageSame) {
        return;
      }

      try {
        const savedConfig = await galleryClient.saveConfig({
          ...config,
          tagPool: mergedTagPool,
          tagPoolUsage,
        } as TConfig);
        setConfig(savedConfig);
      } catch (error) {
        const message = toErrorMessage(error, 'Failed to sync startup tag pool.');
        setStatus(message);
        void logAppEvent(message, 'error', 'startup-tag-pool-sync');
      }
    };

    void startupTagPoolSync();
  }, [config, galleryClient, logAppEvent, normalizeTagPool, scanResult.games, scanResult.scannedAt, setConfig, setStatus, toErrorMessage]);
}
