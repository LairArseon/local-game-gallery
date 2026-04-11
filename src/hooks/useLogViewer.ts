/**
 * Manages log viewer state, filtering, and maintenance actions.
 *
 * The hook coordinates modal open/load timing, derived filtered log content,
 * clear-log operations, and log-folder shortcuts while surfacing status/logging
 * feedback on failures. This keeps diagnostics tooling isolated from UI markup.
 */
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';

type UseLogViewerArgs = {
  setStatus: Dispatch<SetStateAction<string>>;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
};

export function useLogViewer({ setStatus, logAppEvent, toErrorMessage }: UseLogViewerArgs) {
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

    // Filters operate on line prefixes/tokens from the logger format: [date ...][LEVEL].
    const lines = logContents.split(/\r?\n/).filter(Boolean);
    const filtered = lines.filter((line) => {
      const matchesLevel = logLevelFilter === 'all' || line.includes(`[${logLevelFilter.toUpperCase()}]`);
      const matchesDate = !logDateFilter || line.startsWith(`[${logDateFilter}`);
      return matchesLevel && matchesDate;
    });

    return filtered.join('\n');
  }, [logContents, logDateFilter, logLevelFilter]);

  async function openLogViewer() {
    // Open first so users see immediate feedback while file contents are loading.
    setIsLogModalOpen(true);
    setIsLogLoading(true);
    try {
      const contents = await window.gallery.getLogContents();
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
    // Destructive operation requires explicit local confirmation.
    const confirmed = window.confirm(t('logs.clearConfirm'));
    if (!confirmed) {
      return;
    }

    setIsLogClearing(true);
    try {
      await window.gallery.clearLogContents();
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
      const result = await window.gallery.openLogFolder();
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
