import type { ReactNode, RefObject } from 'react';
import { CustomSelect } from './CustomSelect';

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
  logViewerRef?: RefObject<HTMLPreElement | null>;
  extraFooterActions?: ReactNode;
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
  logViewerRef,
  extraFooterActions,
}: LogViewerModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal-panel modal-panel--wide" onClick={(event) => event.stopPropagation()}>
        <header className="modal-panel__header">
          <h2>Event logs</h2>
          <button className="button" type="button" onClick={onClose}>Close</button>
        </header>
        <div className="modal-panel__body">
          <div className="log-viewer__filters">
            <label className="field">
              <span>Level</span>
              <CustomSelect
                ariaLabel="Log level filter"
                value={logLevelFilter}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'info', label: 'Info' },
                  { value: 'warn', label: 'Warn' },
                  { value: 'error', label: 'Error' },
                ]}
                onChange={(nextValue) => onChangeLogLevel(nextValue as LogLevelFilter)}
              />
            </label>
            <label className="field">
              <span>Date</span>
              <input type="date" value={logDateFilter} onChange={(event) => onChangeDateFilter(event.target.value)} />
            </label>
          </div>
          <pre ref={logViewerRef} className="log-viewer">{isLogLoading ? 'Loading logs...' : (filteredLogContents || 'No logs found for current filters.')}</pre>
        </div>
        <footer className="modal-panel__footer">
          {extraFooterActions}
          <button className="button" type="button" disabled={isLogClearing} onClick={onClearLogs}>
            {isLogClearing ? 'Clearing...' : 'Clear logs'}
          </button>
          <button className="button" type="button" onClick={onClose}>Close</button>
        </footer>
      </section>
    </div>
  );
}
