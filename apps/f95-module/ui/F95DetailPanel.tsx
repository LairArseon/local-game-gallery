import type { BuiltInModuleRenderContext } from '../../shared/app-shell/types/moduleHostTypes';

type F95DetailPanelProps = {
  context: BuiltInModuleRenderContext;
};

const F95_TAG_PREFIX = 'module_f95_';

function formatF95TagLabel(tagKey: string) {
  const normalizedKey = tagKey.startsWith(F95_TAG_PREFIX) ? tagKey.slice(F95_TAG_PREFIX.length) : tagKey;
  return normalizedKey
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function F95DetailPanel({ context }: F95DetailPanelProps) {
  const game = context.game;
  const moduleTags = context.moduleTags ?? [];

  if (!game) {
    return null;
  }

  const linkedThreadTag = moduleTags.find((tag) => tag.key === 'module_f95_id') ?? null;
  const lastUpdateTag = moduleTags.find((tag) => tag.key === 'module_f95_last_update_at') ?? null;
  const lastTitleTag = moduleTags.find((tag) => tag.key === 'module_f95_last_update_title') ?? null;

  return (
    <div className="f95-module-detail">
      <div className="f95-module-summary-grid">
        <div className="f95-module-summary-card">
          <strong>Thread link</strong>
          <p>{linkedThreadTag?.value ? `F95 thread #${linkedThreadTag.value}` : 'No F95 thread has been linked to this game yet.'}</p>
        </div>
        <div className="f95-module-summary-card">
          <strong>Latest tracked update</strong>
          <p>{lastTitleTag?.value ?? 'No update title stored yet.'}</p>
        </div>
        <div className="f95-module-summary-card">
          <strong>Latest tracked timestamp</strong>
          <p>{lastUpdateTag?.value ?? 'No update timestamp stored yet.'}</p>
        </div>
      </div>

      {moduleTags.length ? (
        <div className="detail-tags f95-module-tag-list">
          <strong>Stored F95 fields</strong>
          {moduleTags.map((tag) => (
            <p key={tag.key}>
              <span className="f95-module-tag-list__label">{formatF95TagLabel(tag.key)}:</span> {tag.value || 'Empty'}
            </p>
          ))}
        </div>
      ) : (
        <div className="f95-module-alert">
          <strong>No F95 metadata yet</strong>
          <p>Once the sync flow lands, this panel will summarize the linked thread, update checkpoint, and feed-derived per-game state.</p>
        </div>
      )}
    </div>
  );
}