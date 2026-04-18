/**
 * Shared runtime helpers used by app shells.
 */
import type { GalleryLogClientLike, LogAppEvent } from '../types/appRuntimeTypes';

export function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function createLogAppEvent(client: GalleryLogClientLike): LogAppEvent {
  return async (message, level = 'info', source = 'renderer') => {
    try {
      await client.logEvent({ message, level, source });
    } catch {
      // Avoid status recursion if logging backend is unavailable.
    }
  };
}

