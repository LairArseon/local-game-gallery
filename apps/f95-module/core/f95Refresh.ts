import type { BuiltInModuleRefreshContext, BuiltInModuleRefreshResult, ModuleHostConfigState, ModuleHostGameTag } from '../../shared/app-shell/types/moduleHostTypes';
import { createModuleLogSource } from '../../shared/app-shell/core/moduleLogSources';
import { F95_GAMES_RSS_URL, parseF95GamesRss } from './f95Rss';
import {
  F95_CREATOR_TAG,
  F95_LAST_FEED_ITEM_ID_TAG,
  F95_LAST_UPDATED_TAG,
  F95_LAST_UPDATE_TITLE_TAG,
  F95_THREAD_ID_TAG,
  F95_THREAD_URL_TAG,
  F95_UP_TO_DATE_TAG,
  getF95BooleanTagValue,
  getF95TagValue,
  setF95TagValue,
} from './f95Tags';

const F95_SYNC_LOG_SOURCE = createModuleLogSource('f95', 'sync');

function readStringState(configState: ModuleHostConfigState, key: string, fallback = '') {
  const value = configState.state[key];
  return typeof value === 'string' ? value : fallback;
}

function readNumberState(configState: ModuleHostConfigState, key: string, fallback = 0) {
  const value = configState.state[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function hasIntervalElapsed(lastAttemptAt: string, intervalSeconds: number) {
  if (!lastAttemptAt || intervalSeconds <= 0) {
    return true;
  }

  const lastAttemptMs = Date.parse(lastAttemptAt);
  if (!Number.isFinite(lastAttemptMs)) {
    return true;
  }

  return (Date.now() - lastAttemptMs) >= intervalSeconds * 1000;
}

function toComparableTime(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function withUpdatedTags(tags: ModuleHostGameTag[], nextEntries: Array<[string, string]>) {
  return nextEntries.reduce((currentTags, [key, value]) => setF95TagValue(currentTags, key, value), tags);
}

export async function runF95RefreshSync(context: BuiltInModuleRefreshContext): Promise<BuiltInModuleRefreshResult | null> {
  const intervalSeconds = Math.max(0, readNumberState(context.configState, 'syncIntervalSeconds', 3600));
  const lastSyncAttemptAt = readStringState(context.configState, 'lastSyncAttemptAt');
  if (!hasIntervalElapsed(lastSyncAttemptAt, intervalSeconds)) {
    return null;
  }

  const nextAttemptAt = new Date().toISOString();
  const feedUrl = readStringState(context.configState, 'feedUrl', F95_GAMES_RSS_URL).trim() || F95_GAMES_RSS_URL;
  const trackedGames = context.games.filter((game) => getF95TagValue(game.metadata.customTags, F95_THREAD_ID_TAG));

  try {
    const response = await fetch(feedUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const rssXml = await response.text();
    const feedItems = parseF95GamesRss(rssXml);
    const successfulSyncAt = new Date().toISOString();
    const itemsByThreadId = new Map(feedItems.map((item) => [item.threadId, item]));
    const updatedGamePaths: string[] = [];
    for (const game of trackedGames) {
      const threadId = getF95TagValue(game.metadata.customTags, F95_THREAD_ID_TAG);
      const matchingItem = itemsByThreadId.get(threadId);
      if (!threadId || !matchingItem) {
        continue;
      }

      const storedThreadUrl = getF95TagValue(game.metadata.customTags, F95_THREAD_URL_TAG);
      const currentFeedItemId = getF95TagValue(game.metadata.customTags, F95_LAST_FEED_ITEM_ID_TAG);
      const resolvedThreadUrl = storedThreadUrl || matchingItem.threadUrl;
      const currentLastUpdated = getF95TagValue(game.metadata.customTags, F95_LAST_UPDATED_TAG);
      const nextPublishedAt = matchingItem.publishedAt;
      const nextFeedItemId = matchingItem.guid || matchingItem.threadId || '';
      const currentLastUpdatedMs = toComparableTime(currentLastUpdated);
      const nextPublishedAtMs = toComparableTime(nextPublishedAt);
      let nextTags = game.metadata.customTags;
      let shouldPersist = false;

      if (!currentLastUpdated) {
        nextTags = withUpdatedTags(nextTags, [
          [F95_THREAD_URL_TAG, resolvedThreadUrl],
          [F95_LAST_UPDATED_TAG, nextPublishedAt],
          [F95_UP_TO_DATE_TAG, 'true'],
          [F95_LAST_UPDATE_TITLE_TAG, matchingItem.rawTitle],
          [F95_LAST_FEED_ITEM_ID_TAG, nextFeedItemId],
          [F95_CREATOR_TAG, matchingItem.creator],
        ]);
        shouldPersist = true;
      } else if (nextPublishedAtMs !== null && (currentLastUpdatedMs === null || nextPublishedAtMs > currentLastUpdatedMs)) {
        nextTags = withUpdatedTags(nextTags, [
          [F95_THREAD_URL_TAG, resolvedThreadUrl],
          [F95_LAST_UPDATED_TAG, nextPublishedAt],
          [F95_UP_TO_DATE_TAG, 'false'],
          [F95_LAST_UPDATE_TITLE_TAG, matchingItem.rawTitle],
          [F95_LAST_FEED_ITEM_ID_TAG, nextFeedItemId],
          [F95_CREATOR_TAG, matchingItem.creator],
        ]);
        shouldPersist = true;

      }

      if (!shouldPersist) {
        continue;
      }

      try {
        await context.galleryClient.saveGameMetadata({
          gamePath: game.path,
          title: game.name,
          metadata: {
            ...game.metadata,
            customTags: nextTags,
          },
        });
        updatedGamePaths.push(game.path);
      } catch (error) {
        const errorMessage = context.toErrorMessage(error, `Failed to persist F95 metadata for ${game.name}.`);
        await context.logAppEvent(errorMessage, 'error', F95_SYNC_LOG_SOURCE);
      }
    }

    const latestFeedItem = feedItems[0] ?? null;
    const nextConfigState: ModuleHostConfigState = {
      ...context.configState,
      state: {
        ...context.configState.state,
        syncIntervalSeconds: intervalSeconds,
        feedUrl,
        lastSyncAttemptAt: nextAttemptAt,
        lastSuccessfulSyncAt: successfulSyncAt,
        lastProcessedItemId: latestFeedItem?.guid ?? latestFeedItem?.threadId ?? null,
        lastProcessedPublishedAt: latestFeedItem?.publishedAt ?? null,
        lastSyncError: '',
      },
    };

    await context.logAppEvent(
      `F95 sync completed. trackedGames=${trackedGames.length}, updatedGames=${updatedGamePaths.length}, feedItems=${feedItems.length}.`,
      'info',
      F95_SYNC_LOG_SOURCE,
    );

    return {
      nextConfigState,
      updatedGamePaths,
    };
  } catch (error) {
    const errorMessage = context.toErrorMessage(error, 'F95 sync failed.');
    await context.logAppEvent(errorMessage, 'error', F95_SYNC_LOG_SOURCE);
    return {
      nextConfigState: {
        ...context.configState,
        state: {
          ...context.configState.state,
          syncIntervalSeconds: intervalSeconds,
          feedUrl,
          lastSyncAttemptAt: nextAttemptAt,
          lastSyncError: errorMessage,
        },
      },
    };
  }
}