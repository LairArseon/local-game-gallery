import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { parseGalleryLogContents } from '../core/moduleLogSources';

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

type LogLevelFilter = 'all' | 'info' | 'warn' | 'error';
type LogModuleFilter = 'all' | string;
type LogSortOrder = 'newest' | 'oldest';

export function useLogViewer({ galleryClient, setStatus, logAppEvent, toErrorMessage }: UseLogViewerArgs) {
  const { t } = useTranslation();
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [logContents, setLogContents] = useState('');
  const [isLogLoading, setIsLogLoading] = useState(false);
  const [isLogClearing, setIsLogClearing] = useState(false);
  const [logLevelFilter, setLogLevelFilter] = useState<LogLevelFilter>('all');
  const [logDateFilter, setLogDateFilter] = useState('');
  const [logModuleFilter, setLogModuleFilter] = useState<LogModuleFilter>('all');
  const [logSortOrder, setLogSortOrder] = useState<LogSortOrder>('newest');

  const parsedLogEntries = useMemo(() => parseGalleryLogContents(logContents), [logContents]);

  const availableLogModules = useMemo(
    () => [...new Set(parsedLogEntries.map((entry) => entry.moduleId).filter((moduleId): moduleId is string => Boolean(moduleId)))].sort(),
    [parsedLogEntries],
  );

  const filteredLogEntries = useMemo(() => {
    const filtered = parsedLogEntries.filter((entry) => {
      const matchesLevel = logLevelFilter === 'all' || entry.level === logLevelFilter;
      const matchesDate = !logDateFilter || entry.timestamp.startsWith(logDateFilter);
      const matchesModule = logModuleFilter === 'all' || entry.moduleId === logModuleFilter;
      return matchesLevel && matchesDate && matchesModule;
    });

    return filtered.sort((left, right) => {
      const leftValue = Number.isFinite(left.epochMs) ? left.epochMs : 0;
      const rightValue = Number.isFinite(right.epochMs) ? right.epochMs : 0;
      return logSortOrder === 'oldest' ? leftValue - rightValue : rightValue - leftValue;
    });
  }, [logDateFilter, logLevelFilter, logModuleFilter, logSortOrder, parsedLogEntries]);

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
    parsedLogEntries,
    filteredLogEntries,
    availableLogModules,
    logLevelFilter,
    logDateFilter,
    logModuleFilter,
    logSortOrder,
    setLogLevelFilter,
    setLogDateFilter,
    setLogModuleFilter,
    setLogSortOrder,
    openLogViewer,
    closeLogViewer,
    clearLogsFromViewer,
    openLogFolderFromSetup,
  };
}
