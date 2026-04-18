import type { Dispatch, SetStateAction } from 'react';
import { useMediaManager as useSharedMediaManager } from '../../../shared/app-shell/hooks/useMediaManager';
import { useGalleryClient } from '../client/context';

const defaultServicePort = 37995;
const configuredServiceBaseUrl = String(
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_GALLERY_SERVICE_URL ?? '',
).trim();

function getWebServiceBaseUrl() {
  if (configuredServiceBaseUrl) {
    return configuredServiceBaseUrl.replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:${defaultServicePort}`;
  }

  return `http://127.0.0.1:${defaultServicePort}`;
}

type UseMediaManagerArgs = {
  setStatus: Dispatch<SetStateAction<string>>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
  refreshScan: () => Promise<unknown>;
};

export function useMediaManager({
  setStatus,
  logAppEvent,
  toErrorMessage,
  refreshScan,
}: UseMediaManagerArgs) {
  const galleryClient = useGalleryClient();

  return useSharedMediaManager({
    galleryClient,
    resolvePreferredServiceBaseUrl: getWebServiceBaseUrl,
    setStatus,
    logAppEvent,
    toErrorMessage,
    refreshScan,
  });
}