import { useState } from 'react';
import type { BuiltInModuleRenderContext } from '../../shared/app-shell/types/moduleHostTypes';
import { F95_CREATOR_TAG, F95_LAST_FEED_ITEM_ID_TAG, F95_LAST_UPDATED_TAG, F95_LAST_UPDATE_TITLE_TAG, F95_THREAD_ID_TAG, F95_THREAD_URL_TAG, F95_UP_TO_DATE_TAG, getF95BooleanTagValue, getF95TagValue, setF95TagValue } from '../core/f95Tags';

type F95DetailPanelProps = {
  context: BuiltInModuleRenderContext;
};

export function F95DetailPanel({ context }: F95DetailPanelProps) {
  const game = context.game;
  const moduleTags = context.moduleTags ?? [];
  const [isDismissingUpdate, setIsDismissingUpdate] = useState(false);

  if (!game) {
    return null;
  }

  const threadId = getF95TagValue(moduleTags, F95_THREAD_ID_TAG);
  const threadUrl = getF95TagValue(moduleTags, F95_THREAD_URL_TAG);
  const creator = getF95TagValue(moduleTags, F95_CREATOR_TAG);
  const lastUpdateAt = getF95TagValue(moduleTags, F95_LAST_UPDATED_TAG);
  const lastUpdateTitle = getF95TagValue(moduleTags, F95_LAST_UPDATE_TITLE_TAG);
  const lastFeedItemId = getF95TagValue(moduleTags, F95_LAST_FEED_ITEM_ID_TAG);
  const isUpToDate = getF95BooleanTagValue(moduleTags, F95_UP_TO_DATE_TAG, true);
  const canDismissPendingUpdate = !isUpToDate && Boolean(context.onGameMetadataTagsChange);

  return (
    <div className={`f95-module-detail ${!isUpToDate ? 'f95-module-detail--pending' : ''}`}>
      {!isUpToDate ? (
        <div className="f95-module-alert f95-module-alert--pending">
          <div className="f95-module-alert__body">
            <strong>F95 update pending</strong>
            <p>{lastUpdateTitle ? `This game has a pending F95 update: ${lastUpdateTitle}` : 'This game has a pending F95 update notice.'}</p>
          </div>
          {canDismissPendingUpdate ? (
            <button
              className="button button--icon"
              type="button"
              disabled={isDismissingUpdate}
              onClick={() => {
                if (!context.onGameMetadataTagsChange) {
                  return;
                }

                setIsDismissingUpdate(true);
                void context.onGameMetadataTagsChange((currentTags) => setF95TagValue(currentTags, F95_UP_TO_DATE_TAG, 'true'))
                  .finally(() => setIsDismissingUpdate(false));
              }}
            >
              {isDismissingUpdate ? 'Dismissing...' : 'Dismiss update'}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="f95-module-summary-grid">
        <div className="f95-module-summary-card">
          <strong>Thread link</strong>
          <p>{threadId ? `F95 thread #${threadId}` : 'No F95 thread has been linked to this game yet.'}</p>
        </div>
        <div className="f95-module-summary-card">
          <strong>Thread URL</strong>
          <p>{threadUrl || 'No thread URL stored yet.'}</p>
        </div>
        <div className="f95-module-summary-card">
          <strong>Creator</strong>
          <p>{creator || 'No creator stored yet.'}</p>
        </div>
        <div className="f95-module-summary-card">
          <strong>F95 status</strong>
          <p>{isUpToDate ? 'Up to date' : 'Update available'}</p>
        </div>
        <div className="f95-module-summary-card">
          <strong>Latest tracked update</strong>
          <p>{lastUpdateTitle || 'No update title stored yet.'}</p>
        </div>
        <div className="f95-module-summary-card">
          <strong>Latest tracked timestamp</strong>
          <p>{lastUpdateAt || 'No update timestamp stored yet.'}</p>
        </div>
        <div className="f95-module-summary-card">
          <strong>Latest feed item id</strong>
          <p>{lastFeedItemId || 'No feed item id stored yet.'}</p>
        </div>
      </div>

      {!moduleTags.length ? (
        <div className="f95-module-alert">
          <strong>No F95 metadata yet</strong>
          <p>Link an F95 thread in metadata and the refresh flow will populate the feed-derived update fields here.</p>
        </div>
      ) : null}
    </div>
  );
}