/**
 * Orchestrates app icon configuration workflows end-to-end.
 *
 * The hook handles file picking, drag/drop staging, icon inspection, preview
 * cache busting, and runtime icon apply/reset actions. It also captures drag
 * depth state to avoid flicker during nested drag events and reports status/log
 * messages for both success and failure paths.
 *
 * New to this project: this hook owns icon staging, validation, preview, and apply/reset; trace GalleryClient icon calls to adapter/preload handlers for persistence/runtime apply.
 */
import { useEffect, useRef, useState, type Dispatch, type DragEvent, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { useGalleryClient } from '../client/context';
import type { AppIconInspectResult, GalleryConfig } from '../types';

const defaultServicePort = 37995;
const configuredServiceBaseUrl = String(import.meta.env.VITE_GALLERY_SERVICE_URL ?? '').trim();

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
  const { t } = useTranslation();
  const galleryClient = useGalleryClient();
  const [appIconSummary, setAppIconSummary] = useState<AppIconInspectResult | null>(null);
  const [appIconPreviewVersion, setAppIconPreviewVersion] = useState(0);
  const [isAppIconDragActive, setIsAppIconDragActive] = useState(false);
  const appIconDragDepthRef = useRef(0);

  useEffect(() => {
    if (!config) {
      return;
    }

    const iconPath = config.appIconPngPath.trim();
    if (!iconPath) {
      setAppIconSummary(null);
      return;
    }

    const inspectCurrentIcon = async () => {
      try {
        const inspection = await galleryClient.inspectAppIconFile({ filePath: iconPath });
        setAppIconSummary(inspection);
      } catch {
        // Keep setup usable even if previous path became invalid or inaccessible.
        setAppIconSummary({
          isValid: false,
          message: 'Could not validate current app icon path.',
          width: 0,
          height: 0,
          willPadToSquare: false,
        });
      }
    };

    void inspectCurrentIcon();
  }, [config]);

  async function setAppIconPath(candidatePath: string) {
    const iconPath = candidatePath.trim();
    if (!iconPath || !config) {
      return;
    }

    try {
      const inspection = await galleryClient.inspectAppIconFile({ filePath: iconPath });
      setAppIconSummary(inspection);
      if (!inspection.isValid) {
        setStatus(inspection.message);
        return;
      }

      setConfig({
        ...config,
        appIconPngPath: iconPath,
      });
      setAppIconPreviewVersion((current) => current + 1);
      setStatus(t('status.appIconSelected'));
    } catch (error) {
      const logMessage = toErrorMessage(error, 'Failed to inspect app icon file.');
      setStatus(t('status.failedInspectAppIcon'));
      void logAppEvent(logMessage, 'error', 'select-app-icon');
    }
  }

  async function pickAppIconPng() {
    try {
      const selectedPath = await galleryClient.pickAppIconPng();
      if (!selectedPath) {
        return;
      }

      await setAppIconPath(selectedPath);
    } catch (error) {
      const logMessage = toErrorMessage(error, 'Failed to pick app icon file.');
      setStatus(t('status.failedPickAppIcon'));
      void logAppEvent(logMessage, 'error', 'pick-app-icon');
    }
  }

  async function handleDropAppIconFile(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    appIconDragDepthRef.current = 0;
    setIsAppIconDragActive(false);

    const droppedFile = event.dataTransfer.files?.[0] as (File & { path?: string }) | undefined;
    let droppedPath = String(droppedFile?.path ?? '').trim();

    if (!droppedPath) {
      const uriList = event.dataTransfer.getData('text/uri-list').trim();
      const plainText = event.dataTransfer.getData('text/plain').trim();
      const firstCandidate = (uriList || plainText).split(/\r?\n/).find(Boolean) ?? '';
      if (firstCandidate) {
        const decoded = decodeURI(firstCandidate.trim());
        // Accept both file URI drops and direct absolute path drops from different shells/apps.
        if (decoded.toLowerCase().startsWith('file:///')) {
          droppedPath = decoded.replace(/^file:\/\//i, '');
        } else if (/^[a-zA-Z]:[\\/]/.test(decoded)) {
          droppedPath = decoded;
        }
      }
    }

    if (droppedPath.startsWith('/') && /^[a-zA-Z]:[\\/]/.test(droppedPath.slice(1))) {
      droppedPath = droppedPath.slice(1);
    }

    droppedPath = droppedPath.replace(/\//g, '\\');
    if (!droppedPath) {
      if (droppedFile) {
        try {
          const stagedPath = await galleryClient.stageDroppedAppIcon({
            fileName: droppedFile.name,
            buffer: await droppedFile.arrayBuffer(),
          });
          await setAppIconPath(stagedPath);
          return;
        } catch (error) {
          const logMessage = toErrorMessage(error, 'Could not process dropped icon file.');
          setStatus(t('status.failedProcessDroppedIcon'));
          void logAppEvent(logMessage, 'error', 'drop-app-icon-stage');
          return;
        }
      }

      setStatus(t('status.couldNotReadDroppedPath'));
      return;
    }

    await setAppIconPath(droppedPath);
  }

  function handleAppIconDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    // Track nested dragenter/leaves so highlight does not flicker across children.
    appIconDragDepthRef.current += 1;
    setIsAppIconDragActive(true);
  }

  function handleAppIconDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    appIconDragDepthRef.current = Math.max(0, appIconDragDepthRef.current - 1);
    if (appIconDragDepthRef.current === 0) {
      setIsAppIconDragActive(false);
    }
  }

  function resetAppIcon() {
    if (!config) {
      return;
    }

    setConfig({
      ...config,
      appIconPngPath: '',
    });
    setAppIconSummary(null);
    setAppIconPreviewVersion((current) => current + 1);
    setStatus(t('status.appIconReset'));
  }

  async function applyAppIconNow() {
    if (!config?.appIconPngPath) {
      setStatus(t('status.selectIconFirst'));
      return;
    }

    try {
      const result = await galleryClient.applyRuntimeAppIcon({ filePath: config.appIconPngPath });
      setStatus(result.message);
    } catch (error) {
      const logMessage = toErrorMessage(error, 'Failed to apply runtime icon.');
      setStatus(t('status.failedApplyRuntimeIcon'));
      void logAppEvent(logMessage, 'error', 'apply-runtime-icon');
    }
  }

  const appIconPreviewSrc = config?.appIconPngPath
    // Version token forces preview image refresh after selecting/resetting icon.
    ? (typeof window !== 'undefined' && !('gallery' in window)
      ? `${getWebServiceBaseUrl()}/api/media-file?path=${encodeURIComponent(config.appIconPngPath)}&v=${appIconPreviewVersion}`
      : `${encodeURI(`file:///${config.appIconPngPath.replace(/\\/g, '/')}`)}?v=${appIconPreviewVersion}`)
    : null;

  return {
    appIconSummary,
    appIconPreviewSrc,
    isAppIconDragActive,
    pickAppIconPng,
    handleDropAppIconFile,
    handleAppIconDragEnter,
    handleAppIconDragLeave,
    resetAppIcon,
    applyAppIconNow,
  };
}






