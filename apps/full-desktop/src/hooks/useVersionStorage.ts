import type { GalleryClient } from '../client/contracts';
import {
  useVersionStorage as useSharedVersionStorage,
  type VersionCompressionProgress,
} from '../../../shared/app-shell/hooks/useVersionStorage';

type UseVersionStorageArgs = {
  galleryClient: GalleryClient;
  setStatus: (message: string) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  refreshGame: (gamePath: string) => Promise<unknown>;
};

export type { VersionCompressionProgress };

export function useVersionStorage(args: UseVersionStorageArgs) {
  return useSharedVersionStorage(args);
}
