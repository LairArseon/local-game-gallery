import type { BuiltInModuleRenderContext } from '../../shared/app-shell/types/moduleHostTypes';
import {
  buildF95ThreadUrl,
  extractF95ThreadIdFromUrl,
  F95_CREATOR_TAG,
  F95_LAST_UPDATED_TAG,
  F95_THREAD_ID_TAG,
  F95_THREAD_URL_TAG,
  F95_UP_TO_DATE_TAG,
  getF95BooleanTagValue,
  getF95TagValue,
  normalizeF95ThreadUrl,
  updateF95MetadataDraft,
} from '../core/f95Tags';

type F95MetadataEditorSectionProps = {
  context: BuiltInModuleRenderContext;
};

export function F95MetadataEditorSection({ context }: F95MetadataEditorSectionProps) {
  const metadataDraft = context.metadataDraft;
  if (!metadataDraft || !context.onMetadataDraftChange) {
    return null;
  }

  const threadId = getF95TagValue(metadataDraft.customTags, F95_THREAD_ID_TAG);
  const threadUrl = getF95TagValue(metadataDraft.customTags, F95_THREAD_URL_TAG);
  const creator = getF95TagValue(metadataDraft.customTags, F95_CREATOR_TAG);
  const lastUpdated = getF95TagValue(metadataDraft.customTags, F95_LAST_UPDATED_TAG);
  const isUpToDate = getF95BooleanTagValue(metadataDraft.customTags, F95_UP_TO_DATE_TAG, true);

  return (
    <div className="f95-metadata-editor">
      <label className="field">
        <span>Thread URL</span>
        <input
          type="url"
          value={threadUrl}
          placeholder="https://f95zone.to/threads/298325"
          onChange={(event) => {
            const nextUrl = normalizeF95ThreadUrl(event.target.value);
            const nextThreadId = extractF95ThreadIdFromUrl(nextUrl);
            context.onMetadataDraftChange?.((current) => {
              let nextDraft = updateF95MetadataDraft(current, F95_THREAD_URL_TAG, nextUrl);
              nextDraft = updateF95MetadataDraft(nextDraft, F95_THREAD_ID_TAG, nextThreadId);
              return nextDraft;
            });
          }}
        />
        <small className="field__hint">Paste any F95 thread URL and the thread id will be normalized into the namespaced custom tags.</small>
      </label>
      <div className="f95-metadata-editor__row">
        <label className="field">
          <span>F95 ID</span>
          <input
            type="text"
            value={threadId}
            placeholder="298325"
            onChange={(event) => {
              const nextThreadId = event.target.value.trim();
              context.onMetadataDraftChange?.((current) => {
                let nextDraft = updateF95MetadataDraft(current, F95_THREAD_ID_TAG, nextThreadId);
                nextDraft = updateF95MetadataDraft(nextDraft, F95_THREAD_URL_TAG, buildF95ThreadUrl(nextThreadId));
                return nextDraft;
              });
            }}
          />
        </label>
        <label className="field">
          <span>Creator</span>
          <input
            type="text"
            value={creator}
            placeholder="Optional display override"
            onChange={(event) => {
              context.onMetadataDraftChange?.((current) => updateF95MetadataDraft(current, F95_CREATOR_TAG, event.target.value));
            }}
          />
        </label>
      </div>

      <div className="f95-metadata-editor__row">
        <label className="field">
          <span>F95 Last Updated</span>
          <input
            type="text"
            value={lastUpdated}
            placeholder="Tue, 12 May 2026 09:33:54 +0000"
            onChange={(event) => {
              context.onMetadataDraftChange?.((current) => updateF95MetadataDraft(current, F95_LAST_UPDATED_TAG, event.target.value));
            }}
          />
        </label>
        <label className="field field--toggle">
          <span>F95 Up To Date</span>
          <input
            type="checkbox"
            checked={isUpToDate}
            onChange={(event) => {
              context.onMetadataDraftChange?.((current) => updateF95MetadataDraft(current, F95_UP_TO_DATE_TAG, event.target.checked ? 'true' : 'false'));
            }}
          />
        </label>
      </div>
    </div>
  );
}