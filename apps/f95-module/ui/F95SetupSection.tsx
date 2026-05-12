import type { BuiltInModuleRenderContext, ModuleHostStateValue } from '../../shared/app-shell/types/moduleHostTypes';
import { F95_GAMES_RSS_URL } from '../core/f95Rss';

type F95SetupSectionProps = {
  context: BuiltInModuleRenderContext;
};

function readStringState(value: ModuleHostStateValue | undefined) {
  return typeof value === 'string' ? value : '';
}

function readNullableStringState(value: ModuleHostStateValue | undefined) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function updateStateValue(
  context: BuiltInModuleRenderContext,
  key: string,
  value: ModuleHostStateValue,
) {
  context.onConfigStateChange?.({
    ...context.configState,
    state: {
      ...context.configState.state,
      [key]: value,
    },
  });
}

export function F95SetupSection({ context }: F95SetupSectionProps) {
  const feedUrl = readStringState(context.configState.state.feedUrl);
  const syncIntervalSeconds = Number(context.configState.state.syncIntervalSeconds ?? 3600) || 3600;
  const openLinksInIncognito = Boolean(context.configState.state.openLinksInIncognito ?? true);
  const lastSyncAttemptAt = readNullableStringState(context.configState.state.lastSyncAttemptAt);
  const lastSuccessfulSyncAt = readNullableStringState(context.configState.state.lastSuccessfulSyncAt);
  const lastSyncError = readNullableStringState(context.configState.state.lastSyncError);
  const displayedLastSuccessfulSyncAt = lastSuccessfulSyncAt ?? (!lastSyncError ? lastSyncAttemptAt : null);
  const formattedLastSyncAttemptAt = formatDateTime(lastSyncAttemptAt);
  const formattedLastSuccessfulSyncAt = formatDateTime(displayedLastSuccessfulSyncAt);

  return (
    <div className="f95-module-setup">
      <label className="field">
        <span>RSS feed URL</span>
        <input
          type="url"
          value={feedUrl}
          placeholder={F95_GAMES_RSS_URL}
          onChange={(event) => updateStateValue(context, 'feedUrl', event.target.value)}
        />
        <small className="field__hint">The F95 games feed currently exposes item title, thread link, creator, guid, publication date, and preview image HTML.</small>
      </label>

      <label className="field">
        <span>Sync interval in seconds</span>
        <input
          type="number"
          min="0"
          step="1"
          value={syncIntervalSeconds}
          onChange={(event) => updateStateValue(context, 'syncIntervalSeconds', Math.max(0, Number(event.target.value) || 0))}
        />
        <small className="field__hint">A refresh-triggered sync will only run again once this many seconds have elapsed since the last attempt.</small>
      </label>

      <label className="field field--toggle">
        <span>Open F95 links in private window</span>
        <input
          type="checkbox"
          checked={openLinksInIncognito}
          onChange={(event) => updateStateValue(context, 'openLinksInIncognito', event.target.checked)}
        />
        <small className="field__hint">Desktop mode will try a private or incognito browser window first when an F95 notification opens the thread URL.</small>
      </label>

      <div className="f95-module-summary-grid">
        <div className="f95-module-summary-card">
          <strong>Last sync attempt</strong>
          <p>{formattedLastSyncAttemptAt ?? 'No sync attempt recorded yet.'}</p>
        </div>
        <div className="f95-module-summary-card">
          <strong>Last successful sync</strong>
          <p>{formattedLastSuccessfulSyncAt ?? 'No sync has completed yet.'}</p>
        </div>
      </div>

      {lastSyncError ? (
        <div className="f95-module-alert f95-module-alert--error">
          <strong>Last sync error</strong>
          <p>{lastSyncError}</p>
        </div>
      ) : null}

      <div className="f95-module-actions">
        <button
          className="button button--icon"
          type="button"
          onClick={() => {
            context.onConfigStateChange?.({
              ...context.configState,
              state: {
                ...context.configState.state,
                lastSuccessfulSyncAt: null,
                lastSyncAttemptAt: null,
                lastProcessedItemId: null,
                lastProcessedPublishedAt: null,
                lastSyncError: '',
              },
            });
          }}
        >
          Clear sync checkpoint
        </button>
      </div>
    </div>
  );
}