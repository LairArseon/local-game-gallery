import { useState } from 'react';
import { CloudSync } from 'lucide-react';
import type { BuiltInModuleRenderContext } from '../../shared/app-shell/types/moduleHostTypes';
import {
  F95_CREATOR_TAG,
  F95_LAST_FEED_ITEM_ID_TAG,
  F95_LAST_UPDATED_TAG,
  F95_LAST_UPDATE_TITLE_TAG,
  F95_OVERVIEW_TAG,
  F95_STARS_RATING_TAG,
  F95_THREAD_ID_TAG,
  F95_THREAD_TAGS_TAG,
  F95_THREAD_URL_TAG,
  F95_UP_TO_DATE_TAG,
  F95_VERSION_TAG,
  F95_VOTE_COUNT_TAG,
  getF95BooleanTagValue,
  getF95TagValue,
  parseF95TagList,
  setF95TagValue,
} from '../core/f95Tags';
import {
  applyF95ThreadPageMetadata,
  fetchF95ThreadPageMetadata,
  formatF95ThreadPageFetchError,
  getF95ThreadPageFetchStepLabel,
} from '../core/f95ThreadPageV1';

type F95DetailPanelProps = {
  context: BuiltInModuleRenderContext;
};

function parseF95Rating(value: string) {
  const normalizedValue = String(value ?? '').trim().replace(',', '.');
  const match = normalizedValue.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const parsedValue = Number.parseFloat(match[0]);
  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  return Math.min(5, Math.max(0, parsedValue));
}

function parseF95VoteCount(value: string) {
  const digitsOnly = String(value ?? '').replace(/[^\d]/g, '');
  if (!digitsOnly) {
    return null;
  }

  const parsedValue = Number.parseInt(digitsOnly, 10);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function formatF95Rating(value: number) {
  return value.toFixed(1);
}

function formatF95DateTime(value: string) {
  const normalizedValue = String(value ?? '').trim();
  if (!normalizedValue) {
    return '';
  }

  const parsedValue = Date.parse(normalizedValue);
  if (Number.isNaN(parsedValue)) {
    return normalizedValue;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsedValue);
}

function renderFact(label: string, value: string) {
  return (
    <div className="f95-module-fact" key={label}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

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
  const overview = getF95TagValue(moduleTags, F95_OVERVIEW_TAG);
  const version = getF95TagValue(moduleTags, F95_VERSION_TAG);
  const starsRating = getF95TagValue(moduleTags, F95_STARS_RATING_TAG);
  const voteCount = getF95TagValue(moduleTags, F95_VOTE_COUNT_TAG);
  const threadTags = parseF95TagList(getF95TagValue(moduleTags, F95_THREAD_TAGS_TAG));
  const isUpToDate = getF95BooleanTagValue(moduleTags, F95_UP_TO_DATE_TAG, true);
  const canDismissPendingUpdate = !isUpToDate && Boolean(context.onGameMetadataTagsChange);
  const parsedRating = parseF95Rating(starsRating);
  const parsedVoteCount = parseF95VoteCount(voteCount);
  const ratingPercent = parsedRating === null ? 0 : (parsedRating / 5) * 100;
  const formattedThreadUpdatedAt = formatF95DateTime(lastUpdateAt);
  const hasLinkedThread = Boolean(threadId || threadUrl);
  const overviewText = overview.trim();

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

      {!moduleTags.length ? (
        <div className="f95-module-alert">
          <strong>No F95 metadata yet</strong>
          <p>Link an F95 thread in metadata. RSS refresh will populate feed fields, and the manual fetch action will populate thread-page fields.</p>
        </div>
      ) : (
        <>
          <section className="f95-module-hero">
            <div className="f95-module-hero__eyebrow">
              <span className="f95-module-chip">F95</span>
              <span className={`f95-module-status-pill ${isUpToDate ? 'f95-module-status-pill--current' : 'f95-module-status-pill--pending'}`}>
                {isUpToDate ? 'Up to date' : 'Update available'}
              </span>
            </div>
            <div className="f95-module-hero__main">
              <div className="f95-module-hero__copy">
                <h4>{threadId ? `Thread #${threadId}` : 'F95 metadata linked'}</h4>
                <p>
                  {threadUrl
                    ? threadUrl
                    : 'Store an F95 thread URL in metadata to keep this entry anchored to the source thread.'}
                </p>
              </div>
              <div className="f95-module-hero__rating">
                <span className="f95-module-hero__rating-label">Community rating</span>
                <strong>{parsedRating === null ? '--' : formatF95Rating(parsedRating)}</strong>
                <span>{parsedRating === null ? 'No rating stored yet.' : 'out of 5 stars'}</span>
              </div>
            </div>
          </section>

          <div className="f95-module-panel-grid">
            <section className="f95-module-panel f95-module-panel--rating">
              <div className="f95-module-panel__heading">
                <div>
                  <strong>Rating snapshot</strong>
                  <p>Current F95 thread rating normalized to a five-star scale.</p>
                </div>
              </div>
              {parsedRating === null ? (
                <p className="f95-module-panel__empty">No rating stored yet. Use the manual fetch action when the thread page has a score available.</p>
              ) : (
                <div className="f95-module-rating-block">
                  <div className="f95-module-rating-score">
                    <span className="f95-module-rating-score__value">{formatF95Rating(parsedRating)}</span>
                    <span className="f95-module-rating-score__scale">/5</span>
                  </div>
                  <div className="f95-module-rating-copy">
                    <div className="f95-module-rating-stars" aria-label={`F95 rating ${formatF95Rating(parsedRating)} out of 5`}>
                      <span className="f95-module-rating-stars__base">★★★★★</span>
                      <span className="f95-module-rating-stars__fill" style={{ width: `${ratingPercent}%` }}>★★★★★</span>
                    </div>
                    <p>
                      {parsedVoteCount === null
                        ? 'Vote count has not been stored yet.'
                        : `${new Intl.NumberFormat().format(parsedVoteCount)} votes captured from the thread.`}
                    </p>
                  </div>
                </div>
              )}
            </section>

            <section className="f95-module-panel">
              <div className="f95-module-panel__heading">
                <div>
                  <strong>Thread details</strong>
                  <p>Core identifiers and parsed metadata currently stored for this thread.</p>
                </div>
              </div>
              <dl className="f95-module-fact-list">
                {renderFact('Version', version || 'No version stored yet.')}
                {renderFact('Developer', creator || 'No developer stored yet.')}
                {renderFact('Thread URL', threadUrl || 'No thread URL stored yet.')}
                {renderFact('Thread updated', formattedThreadUpdatedAt || 'No update timestamp stored yet.')}
              </dl>
            </section>

            <section className="f95-module-panel">
              <div className="f95-module-panel__heading">
                <div>
                  <strong>Update tracking</strong>
                  <p>RSS-derived state used to highlight pending updates inside the gallery.</p>
                </div>
              </div>
              <dl className="f95-module-fact-list">
                {renderFact('F95 status', isUpToDate ? 'Up to date' : 'Update available')}
                {renderFact('Latest tracked update', lastUpdateTitle || 'No update title stored yet.')}
                {renderFact('Latest feed item id', lastFeedItemId || 'No feed item id stored yet.')}
                {renderFact('Linked thread', hasLinkedThread ? 'Ready for sync and manual fetch.' : 'Link metadata is incomplete.')}
              </dl>
            </section>
          </div>

          {overviewText ? (
            <section className="f95-module-panel f95-module-panel--wide">
              <div className="f95-module-panel__heading">
                <div>
                  <strong>Overview</strong>
                  <p>Synopsis parsed directly from the current F95 thread page.</p>
                </div>
              </div>
              <p className="f95-module-prose">{overviewText}</p>
            </section>
          ) : null}

          {threadTags.length ? (
            <section className="f95-module-panel">
              <div className="f95-module-panel__heading">
                <div>
                  <strong>F95 tags</strong>
                  <p>Tags currently parsed from the linked thread.</p>
                </div>
              </div>
              <div className="f95-module-tag-pills">
                {threadTags.map((tag) => <span key={tag} className="f95-module-tag-pill">{tag}</span>)}
              </div>
            </section>
          ) : null}

          {!hasLinkedThread ? (
            <div className="f95-module-alert">
              <strong>Link an F95 thread</strong>
              <p>Set an F95 thread id or URL in metadata. RSS refresh populates update fields, and manual fetch populates thread-page details.</p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export function F95DetailPanelHeaderActions({ context }: F95DetailPanelProps) {
  const moduleTags = context.moduleTags ?? [];
  const threadId = getF95TagValue(moduleTags, F95_THREAD_ID_TAG);
  const canFetchContent = Boolean(threadId && context.onGameMetadataTagsChange);
  const [isFetchingContent, setIsFetchingContent] = useState(false);
  const [fetchStatus, setFetchStatus] = useState('');

  return (
    <div className="f95-module-header-actions">
      {fetchStatus ? <span className="f95-module-header-status">{fetchStatus}</span> : null}
      <button
        className="button button--icon-only"
        type="button"
        disabled={!canFetchContent || isFetchingContent}
        aria-label={threadId ? 'Fetch the current F95 thread content for this game.' : 'Set an F95 thread id before fetching content.'}
        title={threadId ? 'Fetch the current F95 thread content for this game.' : 'Set an F95 thread id before fetching content.'}
        onClick={() => {
          if (!threadId || !context.onGameMetadataTagsChange) {
            return;
          }

          setIsFetchingContent(true);
          setFetchStatus(getF95ThreadPageFetchStepLabel('resolve-thread-url'));
          void fetchF95ThreadPageMetadata(threadId, {
            onStepChange: (step) => setFetchStatus(getF95ThreadPageFetchStepLabel(step)),
          })
            .then((metadata) => {
              if (!metadata) {
                throw new Error('The current F95 page parser did not return metadata for this thread.');
              }

              setFetchStatus('Saving metadata...');
              return context.onGameMetadataTagsChange?.((currentTags) => applyF95ThreadPageMetadata(currentTags, metadata));
            })
            .then(() => {
              setFetchStatus('Content updated.');
            })
            .catch((error: unknown) => {
              const detailedMessage = formatF95ThreadPageFetchError(
                error,
                `Failed to fetch F95 thread content for ${context.game?.name ?? 'this game'}.`,
              );
              setFetchStatus('Fetch failed. Check logs.');
              void context.logAppEvent?.(detailedMessage, 'error', 'f95-thread-fetch-manual');
            })
            .finally(() => setIsFetchingContent(false));
        }}
      >
        <CloudSync size={16} aria-hidden="true" />
      </button>
    </div>
  );
}