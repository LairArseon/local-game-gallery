import type { BuiltInModuleRenderContext, ModuleHostStateValue } from '../../shared/app-shell/types/moduleHostTypes';

type F95SetupSectionProps = {
  context: BuiltInModuleRenderContext;
};

function readStringState(value: ModuleHostStateValue | undefined) {
  return typeof value === 'string' ? value : '';
}

function readNullableStringState(value: ModuleHostStateValue | undefined) {
  return typeof value === 'string' && value.trim() ? value : null;
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
  const lastSuccessfulSyncAt = readNullableStringState(context.configState.state.lastSuccessfulSyncAt);
  const lastProcessedItemId = readNullableStringState(context.configState.state.lastProcessedItemId);
  const lastProcessedPublishedAt = readNullableStringState(context.configState.state.lastProcessedPublishedAt);
  const lastSyncError = readNullableStringState(context.configState.state.lastSyncError);

  return (
    <div className="f95-module-setup">
      <label className="field">
        <span>RSS feed URL</span>
        <input
          type="url"
          value={feedUrl}
          placeholder="https://f95zone.to/sam/latest_alpha/latest_data_external/rss"
          onChange={(event) => updateStateValue(context, 'feedUrl', event.target.value)}
        />
        <small className="field__hint">Used by the upcoming sync flow. Leave empty until you are ready to wire a feed endpoint.</small>
      </label>

      <div className="f95-module-summary-grid">
        <div className="f95-module-summary-card">
          <strong>Last successful sync</strong>
          <p>{lastSuccessfulSyncAt ?? 'No sync has completed yet.'}</p>
        </div>
        <div className="f95-module-summary-card">
          <strong>Last processed item</strong>
          <p>{lastProcessedItemId ?? 'No feed item checkpoint stored.'}</p>
        </div>
        <div className="f95-module-summary-card">
          <strong>Last published timestamp</strong>
          <p>{lastProcessedPublishedAt ?? 'No publish timestamp stored.'}</p>
        </div>
      </div>

      {lastSyncError ? (
        <div className="f95-module-alert f95-module-alert--error">
          <strong>Last sync error</strong>
          <p>{lastSyncError}</p>
        </div>
      ) : (
        <div className="f95-module-alert">
          <strong>Module state</strong>
          <p>The F95 module is using the shared module namespace in config and is ready for fetch and checkpoint wiring.</p>
        </div>
      )}

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