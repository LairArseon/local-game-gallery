/**
 * Performs one-time startup synchronization between scanned metadata tags and tag pool config.
 *
 * After the first successful scan in a session, this hook computes canonical tag
 * usage counts and persists merged pool/usage values only when changes are
 * detected. It prevents repetitive writes through an internal guard ref and logs
 * synchronization failures for diagnostics.
 *
 * New to this project: this hook performs one-time post-scan tag-pool synchronization; follow its guard ref and diff checks to see when writes are skipped.
 */
import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { GalleryConfig, ScanResult } from '../types';
import { normalizeTagPool } from '../utils/app-helpers';

type UseStartupTagPoolSyncArgs = {
  config: GalleryConfig | null;
  scanResult: ScanResult;
  setConfig: Dispatch<SetStateAction<GalleryConfig | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
};

export function useStartupTagPoolSync({
  config,
  scanResult,
  setConfig,
  setStatus,
  logAppEvent,
  toErrorMessage,
}: UseStartupTagPoolSyncArgs) {
  const didRunStartupTagPoolSyncRef = useRef(false);

  useEffect(() => {
    // Run once per app session after first successful scan to avoid repeated config writes.
    if (didRunStartupTagPoolSyncRef.current) {
      return;
    }

    if (!config?.gamesRoot || !scanResult.scannedAt) {
      return;
    }

    didRunStartupTagPoolSyncRef.current = true;

    const startupTagPoolSync = async () => {
      // Count usage per game (set-based), so duplicate tags inside one game count once.
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

      // Skip persistence when computed values are unchanged.
      const isTagPoolSame = JSON.stringify(mergedTagPool) === JSON.stringify(config.tagPool ?? []);
      const isUsageSame = JSON.stringify(tagPoolUsage) === JSON.stringify(config.tagPoolUsage ?? {});
      if (isTagPoolSame && isUsageSame) {
        return;
      }

      try {
        const savedConfig = await window.gallery.saveConfig({
          ...config,
          tagPool: mergedTagPool,
          tagPoolUsage,
        });
        setConfig(savedConfig);
      } catch (error) {
        const message = toErrorMessage(error, 'Failed to sync startup tag pool.');
        setStatus(message);
        void logAppEvent(message, 'error', 'startup-tag-pool-sync');
      }
    };

    void startupTagPoolSync();
  }, [config, scanResult.scannedAt, scanResult.games, setConfig, setStatus, logAppEvent, toErrorMessage]);
}






