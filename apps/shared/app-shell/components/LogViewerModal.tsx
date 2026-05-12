import type { ReactNode, RefObject } from 'react';
import { CustomSelect } from './CustomSelect';
import type { ParsedGalleryLogEntry } from '../core/moduleLogSources';

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
  logViewerRef?: RefObject<HTMLDivElement | null>;
  extraFooterActions?: ReactNode;
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
            <label className="field">
              <span>Module</span>
              <CustomSelect
                ariaLabel="Log module filter"
                value={logModuleFilter}
                options={[
                  { value: 'all', label: 'All' },
                  ...availableLogModules.map((moduleId) => ({ value: moduleId, label: moduleId.toUpperCase() })),
                ]}
                onChange={(nextValue) => onChangeLogModule(String(nextValue))}
              />
            </label>
            <label className="field">
              <span>Sort</span>
              <CustomSelect
                ariaLabel="Log sort order"
                value={logSortOrder}
                options={[
                  { value: 'newest', label: 'Newest first' },
                  { value: 'oldest', label: 'Oldest first' },
                ]}
                onChange={(nextValue) => onChangeLogSortOrder(nextValue as LogSortOrder)}
              />
            </label>
          </div>
          <div ref={logViewerRef} className="log-viewer">
            {isLogLoading ? (
              <p className="log-viewer__empty">Loading logs...</p>
            ) : filteredLogEntries.length ? (
              <div className="log-viewer__table-wrap">
                <table className="log-viewer__table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Level</th>
                      <th>Source</th>
                      <th>Module</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.timestamp || 'Unknown'}</td>
                        <td>{entry.level.toUpperCase()}</td>
                        <td>{entry.source}</td>
                        <td>{entry.moduleId ?? '-'}</td>
                        <td>{entry.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="log-viewer__empty">No logs found for current filters.</p>
            )}
          </div>
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
