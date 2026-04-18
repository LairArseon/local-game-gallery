import type { Dispatch, SetStateAction } from 'react';
import { useAppIconSettings as useSharedAppIconSettings } from '../../../shared/app-shell/hooks/useAppIconSettings';
import { useGalleryClient } from '../client/context';
import { resolvePreferredServiceBaseUrl } from '../client/adapters/webClient';
import type { AppIconInspectResult, GalleryConfig } from '../types';

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
    resolvePreferredServiceBaseUrl,
    config,
    setConfig,
    setStatus,
    logAppEvent,
    toErrorMessage,
  });
}