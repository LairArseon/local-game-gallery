/**
 * Encapsulates app bootstrap and persisted configuration actions.
 *
 * This hook initializes config/version state on mount and exposes setup-facing
 * handlers for root selection, config save, and view-mode persistence. It keeps
 * async status/error paths uniform, including menu-bar sync and refresh chaining
 * after successful writes.
 *
 * New to this project: this hook wires bootstrap and config save flows; start with initializeApp and saveConfig to see how persisted settings reach App state.
 */
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { useGalleryClient } from '../client/context';
import type { GalleryConfig, GalleryViewMode, ScanRequestOptions } from '../types';
import { useAppLifecycleCore } from '../../../shared/app-shell/hooks/useAppLifecycleCore';

type RefreshScanMode = 'scan-only' | 'scan-and-sync' | 'parity-sync';

type UseAppLifecycleHandlersArgs = {
  config: GalleryConfig | null;
  setConfig: Dispatch<SetStateAction<GalleryConfig | null>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setIsSaving: Dispatch<SetStateAction<boolean>>;
  setIsSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setViewMode: Dispatch<SetStateAction<GalleryViewMode>>;
  setAppVersion: Dispatch<SetStateAction<string>>;
  confirmInitialMirrorSync: () => Promise<boolean>;
  refreshScan: (mode?: RefreshScanMode, options?: ScanRequestOptions) => Promise<unknown>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
};

export function useAppLifecycleHandlers({
  config,
  setConfig,
  setStatus,
  setIsSaving,
  setIsSidebarOpen,
  setViewMode,
  setAppVersion,
  confirmInitialMirrorSync,
  refreshScan,
  logAppEvent,
  toErrorMessage,
}: UseAppLifecycleHandlersArgs) {
  const { t } = useTranslation();
  const galleryClient = useGalleryClient();

  return useAppLifecycleCore<GalleryConfig, GalleryViewMode, ScanRequestOptions>({
    config,
    setConfig,
    setStatus,
    setIsSaving,
    setIsSidebarOpen,
    setViewMode,
    setAppVersion,
    confirmInitialMirrorSync,
    refreshScan,
    logAppEvent,
    toErrorMessage,
    t,
    galleryClient,
    defaultViewMode: 'poster',
  });
}






