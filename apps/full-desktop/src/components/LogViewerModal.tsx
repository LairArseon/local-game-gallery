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
    />
  );
}






