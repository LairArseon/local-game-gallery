import type { Dispatch, SetStateAction } from 'react';
import { useAppIconSettings as useSharedAppIconSettings } from '../../../shared/app-shell/hooks/useAppIconSettings';
import { useGalleryClient } from '../client/context';
import type { AppIconInspectResult, GalleryConfig } from '../types';

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

type UseAppIconSettingsArgs = {
  config: GalleryConfig | null;
  setConfig: Dispatch<SetStateAction<GalleryConfig | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
};

export function useAppIconSettings({
  config,
  setConfig,
  setStatus,
  logAppEvent,
  toErrorMessage,
}: UseAppIconSettingsArgs) {
  const galleryClient = useGalleryClient();

  return useSharedAppIconSettings<GalleryConfig, AppIconInspectResult>({
    galleryClient,
    resolvePreferredServiceBaseUrl: getWebServiceBaseUrl,
    config,
    setConfig,
    setStatus,
    logAppEvent,
    toErrorMessage,
  });
}