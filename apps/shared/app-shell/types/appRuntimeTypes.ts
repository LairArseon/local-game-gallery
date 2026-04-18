/**
 * Shared runtime helper types for app-shell orchestration.
 */
import type { Dispatch, SetStateAction } from 'react';

export type AppLogLevel = 'info' | 'warn' | 'error';

export type LogEventPayload = {
  message: string;
  level: AppLogLevel;
  source: string;
};

export type GalleryLogClientLike = {
  logEvent: (payload: LogEventPayload) => Promise<void>;
};

export type GalleryCapabilitiesClientLike<TCapabilities> = {
  getServiceCapabilities: () => Promise<TCapabilities>;
};

export type SetCapabilities<TCapabilities> = Dispatch<SetStateAction<TCapabilities>>;

export type LogAppEvent = (
  message: string,
  level?: AppLogLevel,
  source?: string,
) => Promise<void>;
