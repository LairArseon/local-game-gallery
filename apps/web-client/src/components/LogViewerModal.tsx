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

type LogLevelFilter = 'all' | 'info' | 'warn' | 'error';

type LogViewerModalProps = {
  isLogLoading: boolean;
  isLogClearing: boolean;
  filteredLogContents: string;
  logLevelFilter: LogLevelFilter;
  logDateFilter: string;
  onClose: () => void;
  onChangeLogLevel: (value: LogLevelFilter) => void;
  onChangeDateFilter: (value: string) => void;
  onClearLogs: () => void;
};

export function LogViewerModal({
  isLogLoading,
  isLogClearing,
  filteredLogContents,
  logLevelFilter,
  logDateFilter,
  onClose,
  onChangeLogLevel,
  onChangeDateFilter,
  onClearLogs,
}: LogViewerModalProps) {
  const [copyLabel, setCopyLabel] = useState('Copy logs');
  const logViewerRef = useRef<HTMLPreElement | null>(null);

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
      filteredLogContents={filteredLogContents}
      logLevelFilter={logLevelFilter}
      logDateFilter={logDateFilter}
      onClose={onClose}
      onChangeLogLevel={onChangeLogLevel}
      onChangeDateFilter={onChangeDateFilter}
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






