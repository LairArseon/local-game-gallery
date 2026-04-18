/**
 * Shared end-to-end download transfer flow used by download hooks.
 */
import type { DownloadPhase, DownloadProgress } from '../types/downloadTypes';
import type {
  DesktopSaveResult,
  LogAppEvent,
  SaveFileHandle,
  SaveFilePickerWindow,
  Translate,
} from '../types/downloadTransferTypes';

type RunDownloadTransferArgs = {
  hasDesktopBridge: boolean;
  fallbackName: string;
  initialPhase: DownloadPhase;
  initialPercent: number | null;
  desktopPhase: DownloadPhase;
  setProgress: (progress: DownloadProgress | null) => void;
  setStatus: (message: string) => void;
  t: Translate;
  logAppEvent: LogAppEvent;
  logSource: string;
  logSubject: string;
  saveDesktop: () => Promise<DesktopSaveResult>;
  fetchResponse: () => Promise<Response>;
  defaultContentType: string;
};

function getSaveFilePicker() {
  return (window as SaveFilePickerWindow).showSaveFilePicker;
}

function resolveResponseErrorMessage(payload: unknown, status: number) {
  const baseMessage = `Download failed with status ${status}.`;
  if (!payload || typeof payload !== 'object') {
    return baseMessage;
  }

  const maybeError = (payload as { error?: { message?: unknown } }).error;
  const serviceMessage = typeof maybeError?.message === 'string' ? maybeError.message.trim() : '';
  return serviceMessage || baseMessage;
}

function resolveDownloadName(contentDisposition: string, fallbackName: string) {
  const filenameMatch = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(contentDisposition);
  if (filenameMatch?.[1]) {
    return decodeURIComponent(filenameMatch[1]);
  }

  return filenameMatch?.[2] ?? fallbackName;
}

async function readBlobWithProgress(
  response: Response,
  downloadName: string,
  setProgress: (progress: DownloadProgress) => void,
  defaultContentType: string,
) {
  const responseBody = response.body;
  const totalBytesHeader = Number.parseInt(String(response.headers.get('content-length') ?? ''), 10);
  const hasKnownLength = Number.isFinite(totalBytesHeader) && totalBytesHeader > 0;

  if (!responseBody) {
    return response.blob();
  }

  const reader = responseBody.getReader();
  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    chunks.push(value);
    loadedBytes += value.byteLength;

    if (hasKnownLength) {
      const percent = Math.max(0, Math.min(100, Math.round((loadedBytes / totalBytesHeader) * 100)));
      setProgress({ phase: 'downloading', percent, fileName: downloadName });
    } else {
      setProgress({ phase: 'downloading', percent: null, fileName: downloadName });
    }
  }

  return new Blob(chunks, { type: response.headers.get('content-type') ?? defaultContentType });
}

async function saveBlob(
  blob: Blob,
  fileName: string,
  preselectedFileHandle: SaveFileHandle | null,
  picker: SaveFilePickerWindow['showSaveFilePicker'],
  setStatus: (message: string) => void,
  t: Translate,
) {
  if (preselectedFileHandle) {
    const writable = await preselectedFileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    setStatus(t('detail.downloadSaved', { name: fileName }));
    return;
  }

  if (picker) {
    const fileHandle = await picker({ suggestedName: fileName });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    setStatus(t('detail.downloadSaved', { name: fileName }));
    return;
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setStatus(t('detail.downloadStarted', { name: fileName }));
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function runDownloadTransfer({
  hasDesktopBridge,
  fallbackName,
  initialPhase,
  initialPercent,
  desktopPhase,
  setProgress,
  setStatus,
  t,
  logAppEvent,
  logSource,
  logSubject,
  saveDesktop,
  fetchResponse,
  defaultContentType,
}: RunDownloadTransferArgs) {
  const picker = getSaveFilePicker();
  let preselectedFileHandle: SaveFileHandle | null = null;

  if (!hasDesktopBridge && picker) {
    try {
      preselectedFileHandle = await picker({ suggestedName: fallbackName });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setStatus(t('detail.downloadCancelled'));
        await logAppEvent(`Download cancelled by user before transfer: ${logSubject}`, 'warn', logSource);
        return;
      }

      throw error;
    }
  }

  setProgress({ phase: initialPhase, percent: initialPercent, fileName: fallbackName });

  try {
    if (hasDesktopBridge) {
      setProgress({ phase: desktopPhase, percent: null, fileName: fallbackName });

      const result = await saveDesktop();
      if (result.canceled) {
        setStatus(t('detail.downloadCancelled'));
        await logAppEvent(`Download cancelled by user: ${logSubject}`, 'warn', logSource);
        return;
      }

      if (!result.saved) {
        setStatus(t('detail.downloadFailed', { message: result.message }));
        await logAppEvent(`Download failed (${logSubject}): ${result.message}`, 'error', logSource);
        return;
      }

      setStatus(t('detail.downloadSaved', { name: fallbackName }));
      return;
    }

    const response = await fetchResponse();
    if (!response.ok) {
      let payload: unknown = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      throw new Error(resolveResponseErrorMessage(payload, response.status));
    }

    const downloadName = resolveDownloadName(response.headers.get('content-disposition') ?? '', fallbackName);
    setProgress({ phase: 'downloading', percent: 0, fileName: downloadName });

    const blob = await readBlobWithProgress(response, downloadName, setProgress, defaultContentType);
    setProgress({ phase: 'saving', percent: null, fileName: downloadName });

    await saveBlob(blob, downloadName, preselectedFileHandle, picker, setStatus, t);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      setStatus(t('detail.downloadCancelled'));
      await logAppEvent(`Download cancelled by user: ${logSubject}`, 'warn', logSource);
      return;
    }

    const message = error instanceof Error ? error.message : t('detail.downloadFailedUnknown');
    setStatus(t('detail.downloadFailed', { message }));
    await logAppEvent(`Download failed (${logSubject}): ${message}`, 'error', logSource);
  } finally {
    setProgress(null);
  }
}

