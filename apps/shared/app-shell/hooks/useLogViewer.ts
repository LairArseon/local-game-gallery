import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';

type GalleryClientLike = {
  getLogContents: () => Promise<string>;
  clearLogContents: () => Promise<void>;
  openLogFolder: () => Promise<{ message: string }>;
};

type UseLogViewerArgs = {
  galleryClient: GalleryClientLike;
  setStatus: Dispatch<SetStateAction<string>>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
};

export function useLogViewer({ galleryClient, setStatus, logAppEvent, toErrorMessage }: UseLogViewerArgs) {
  const { t } = useTranslation();
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [logContents, setLogContents] = useState('');
  const [isLogLoading, setIsLogLoading] = useState(false);
  const [isLogClearing, setIsLogClearing] = useState(false);
  const [logLevelFilter, setLogLevelFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [logDateFilter, setLogDateFilter] = useState('');

  const filteredLogContents = useMemo(() => {
    if (!logContents.trim()) {
      return '';
    }

    const lines = logContents.split(/\r?\n/).filter(Boolean);
    const filtered = lines.filter((line) => {
      const matchesLevel = logLevelFilter === 'all' || line.includes(`[${logLevelFilter.toUpperCase()}]`);
      const matchesDate = !logDateFilter || line.startsWith(`[${logDateFilter}`);
      return matchesLevel && matchesDate;
    });

    return filtered.join('\n');
  }, [logContents, logDateFilter, logLevelFilter]);

  async function openLogViewer() {
    setIsLogModalOpen(true);
    setIsLogLoading(true);
    try {
      const contents = await galleryClient.getLogContents();
      setLogContents(contents);
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to load log contents.');
      setLogContents(message);
      setStatus(t('status.failedLoadLogs'));
      void logAppEvent(message, 'error', 'log-viewer');
    } finally {
      setIsLogLoading(false);
    }
  }

  function closeLogViewer() {
    setIsLogModalOpen(false);
  }

  async function clearLogsFromViewer() {
    const confirmed = window.confirm(t('logs.clearConfirm'));
    if (!confirmed) {
      return;
    }

    setIsLogClearing(true);
    try {
      await galleryClient.clearLogContents();
      setLogContents('');
      setStatus(t('status.logsCleared'));
      void logAppEvent('Logs cleared by user.', 'warn', 'log-viewer');
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to clear logs.');
      setStatus(t('status.failedClearLogs'));
      void logAppEvent(message, 'error', 'log-viewer');
    } finally {
      setIsLogClearing(false);
    }
  }

  async function openLogFolderFromSetup() {
    try {
      const result = await galleryClient.openLogFolder();
      setStatus(result.message);
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to open logs folder.');
      setStatus(t('status.failedOpenLogsFolder'));
      void logAppEvent(message, 'error', 'open-log-folder');
    }
  }

  return {
    isLogModalOpen,
    isLogLoading,
    isLogClearing,
    logLevelFilter,
    logDateFilter,
    filteredLogContents,
    setLogLevelFilter,
    setLogDateFilter,
    openLogViewer,
    closeLogViewer,
    clearLogsFromViewer,
    openLogFolderFromSetup,
  };
}
