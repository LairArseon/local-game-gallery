import { createElement } from 'react';
import type { NotificationFeedItem } from '../shared/app-shell/types';
import type { BuiltInModuleDefinition, BuiltInModuleNotificationContext } from '../shared/app-shell/types/moduleHostTypes';
import { createModuleLogSource } from '../shared/app-shell/core/moduleLogSources';
import moduleManifest from './manifest.json';
import { runF95RefreshSync } from './core/f95Refresh';
import {
  F95_LAST_FEED_ITEM_ID_TAG,
  F95_LAST_UPDATED_TAG,
  F95_LAST_UPDATE_TITLE_TAG,
  F95_THREAD_ID_TAG,
  F95_THREAD_URL_TAG,
  F95_UP_TO_DATE_TAG,
  getF95BooleanTagValue,
  getF95TagValue,
} from './core/f95Tags';
import { F95SetupSection } from './ui/F95SetupSection';
import { F95DetailPanel } from './ui/F95DetailPanel';
import { F95MetadataEditorSection } from './ui/F95MetadataEditorSection';
import { F95FocusPanel } from './ui/F95FocusPanel';
import { F95GameUpdateBadge } from './ui/F95GameUpdateBadge';

export const F95_MODULE_ID = 'f95';
export const F95_MODULE_LOG_SOURCE = createModuleLogSource(F95_MODULE_ID);

function getF95NotificationFeedItems(context: BuiltInModuleNotificationContext): NotificationFeedItem[] {
  return context.games
    .filter((game) => {
      const moduleTags = game.metadata.customTags;
      const hasThreadId = Boolean(getF95TagValue(moduleTags, F95_THREAD_ID_TAG));
      return hasThreadId && !getF95BooleanTagValue(moduleTags, F95_UP_TO_DATE_TAG, true);
    })
    .map((game) => {
      const moduleTags = game.metadata.customTags;
      const threadId = getF95TagValue(moduleTags, F95_THREAD_ID_TAG);
      const threadUrl = getF95TagValue(moduleTags, F95_THREAD_URL_TAG);
      const lastUpdated = getF95TagValue(moduleTags, F95_LAST_UPDATED_TAG);
      const lastUpdateTitle = getF95TagValue(moduleTags, F95_LAST_UPDATE_TITLE_TAG);
      const lastFeedItemId = getF95TagValue(moduleTags, F95_LAST_FEED_ITEM_ID_TAG);
      const notificationMarker = [lastUpdated, lastFeedItemId || threadId || game.path]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
        .join(':');

      return {
        id: `module:f95:update:${game.path}:${notificationMarker}`,
        sourceId: F95_MODULE_ID,
        sourceKind: 'module' as const,
        title: game.name,
        message: lastUpdateTitle
          ? `Newer F95 update detected: ${lastUpdateTitle}`
          : 'Newer F95 update detected.',
        createdAt: lastUpdated || '1970-01-01T00:00:00.000Z',
        gamePath: game.path,
        severity: 'info' as const,
        dismissible: true,
        actions: [
          ...(threadUrl ? [{
            id: `open-thread:${game.path}`,
            label: 'Open thread',
            kind: 'open-url' as const,
            payload: {
              url: threadUrl,
            },
          }] : []),
          {
            id: `dismiss:${game.path}`,
            label: 'Dismiss',
            kind: 'dismiss' as const,
          },
        ],
        metadata: {
          moduleId: F95_MODULE_ID,
          notificationMarker,
          threadId,
          threadUrl,
          publishedAt: lastUpdated,
          lastFeedItemId,
        },
      };
    })
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export const f95ModuleDefinition: BuiltInModuleDefinition = {
  id: F95_MODULE_ID,
  displayName: moduleManifest.displayName,
  description: moduleManifest.description,
  installerComponentId: moduleManifest.installerComponentId,
  enabledByDefault: false,
  contributes: [
    {
      id: 'f95.setup.section',
      slot: 'setup.section',
      title: 'F95 Module Settings',
      description: 'Configuration and sync controls for the F95 module.',
      order: 100,
      render: (context) => createElement(F95SetupSection, { context }),
    },
    {
      id: 'f95.metadata.editor.section',
      slot: 'metadata.editor.section',
      title: 'F95 Fields',
      description: 'Per-game F95 identifiers stored in namespaced metadata tags.',
      order: 100,
      render: (context) => createElement(F95MetadataEditorSection, { context }),
    },
    {
      id: 'f95.notification.feed',
      slot: 'notification.feed',
      title: 'F95 Notifications',
      description: 'F95-derived updates and sync notifications.',
      order: 100,
      getItems: getF95NotificationFeedItems,
    },
    {
      id: 'f95.game.card.badge',
      slot: 'game.card.badge',
      title: 'F95 Update Badge',
      description: 'Temporary badge for games with unseen F95 updates.',
      order: 100,
      render: (context) => createElement(F95GameUpdateBadge, { context }),
    },
    {
      id: 'f95.game.focus.panel',
      slot: 'game.focus.panel',
      title: 'F95 Focus Panel',
      description: 'Focused game metadata sourced from F95 state.',
      order: 100,
      render: (context) => createElement(F95FocusPanel, { context }),
    },
    {
      id: 'f95.game.detail.panel',
      slot: 'game.detail.panel',
      title: 'F95 Detail Panel',
      description: 'Detailed F95 update history and metadata for the selected game.',
      order: 100,
      render: (context) => createElement(F95DetailPanel, { context }),
    },
  ],
  getDefaultState: () => ({
    feedUrl: '',
    syncIntervalSeconds: 3600,
    openLinksInIncognito: true,
    lastSyncAttemptAt: null,
    lastSuccessfulSyncAt: null,
    lastProcessedItemId: null,
    lastProcessedPublishedAt: null,
    lastSyncError: '',
  }),
  refresh: runF95RefreshSync,
};

export const moduleEntry = f95ModuleDefinition;

export default f95ModuleDefinition;