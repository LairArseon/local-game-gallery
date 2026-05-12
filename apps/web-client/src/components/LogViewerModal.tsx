/**
 * Modal window for inspecting runtime logs with lightweight filtering tools.
 *
 * The viewer supports level/date filters, empty-state messaging, and guarded
 * clear-log actions while async operations are in progress. It is designed for
 * fast diagnostics without leaving the app, and keeps controls intentionally
 * small so large log payloads remain readable.
 *
 * New to this project: this modal only renders diagnostics UI; follow its props to useLogViewer for loading, filtering, and clear-log behavior.
 */
import { useState } from 'react';
import { useRef } from 'react';
import { LogViewerModal as SharedLogViewerModal } from '../../../shared/app-shell/components/LogViewerModal';
import type { ParsedGalleryLogEntry } from '../../../shared/app-shell/core/moduleLogSources';

type LogLevelFilter = 'all' | 'info' | 'warn' | 'error';
type LogSortOrder = 'newest' | 'oldest';

type LogViewerModalProps = {
  isLogLoading: boolean;
  isLogClearing: boolean;
  filteredLogEntries: ParsedGalleryLogEntry[];
  availableLogModules: string[];
  logLevelFilter: LogLevelFilter;
  logDateFilter: string;
  logModuleFilter: string;
  logSortOrder: LogSortOrder;
  onClose: () => void;
  onChangeLogLevel: (value: LogLevelFilter) => void;
  onChangeDateFilter: (value: string) => void;
  onChangeLogModule: (value: string) => void;
  onChangeLogSortOrder: (value: LogSortOrder) => void;
  onClearLogs: () => void;
};

export function LogViewerModal({
  isLogLoading,
  isLogClearing,
  filteredLogEntries,
  availableLogModules,
  logLevelFilter,
  logDateFilter,
  logModuleFilter,
  logSortOrder,
  onClose,
  onChangeLogLevel,
  onChangeDateFilter,
  onChangeLogModule,
  onChangeLogSortOrder,
  onClearLogs,
}: LogViewerModalProps) {
  const [copyLabel, setCopyLabel] = useState('Copy logs');
  const logViewerRef = useRef<HTMLDivElement | null>(null);

  async function copyLogs() {
    const selection = window.getSelection();
    const selectedText = String(selection?.toString() ?? '').trim();
    const selectedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const selectedInsideViewer = Boolean(
      selectedRange
      && logViewerRef.current
      && logViewerRef.current.contains(selectedRange.commonAncestorContainer),
    );

    if (!selectedText || !selectedInsideViewer) {
      setCopyLabel('Select log text first');
      window.setTimeout(() => setCopyLabel('Copy logs'), 1500);
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(selectedText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = selectedText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }

      setCopyLabel('Copied');
      window.setTimeout(() => setCopyLabel('Copy logs'), 1200);
    } catch {
      setCopyLabel('Copy failed');
      window.setTimeout(() => setCopyLabel('Copy logs'), 1500);
    }
  }

  return (
    <SharedLogViewerModal
      isLogLoading={isLogLoading}
      isLogClearing={isLogClearing}
      filteredLogEntries={filteredLogEntries}
      availableLogModules={availableLogModules}
      logLevelFilter={logLevelFilter}
      logDateFilter={logDateFilter}
      logModuleFilter={logModuleFilter}
      logSortOrder={logSortOrder}
      onClose={onClose}
      onChangeLogLevel={onChangeLogLevel}
      onChangeDateFilter={onChangeDateFilter}
      onChangeLogModule={onChangeLogModule}
      onChangeLogSortOrder={onChangeLogSortOrder}
      onClearLogs={onClearLogs}
      logViewerRef={logViewerRef}
      extraFooterActions={(
        <button className="button" type="button" onClick={() => { void copyLogs(); }}>
          {copyLabel}
        </button>
      )}
    />
  );
}






