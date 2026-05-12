import { createElement } from 'react';
import type { BuiltInModuleDefinition } from '../shared/app-shell/types/moduleHostTypes';
import { createModuleLogSource } from '../shared/app-shell/core/moduleLogSources';
import { F95SetupSection } from './ui/F95SetupSection';
import { F95DetailPanel } from './ui/F95DetailPanel';

export const F95_MODULE_ID = 'f95';
export const F95_MODULE_LOG_SOURCE = createModuleLogSource(F95_MODULE_ID);

export const f95ModuleDefinition: BuiltInModuleDefinition = {
  id: F95_MODULE_ID,
  displayName: 'F95 Module',
  description: 'Provides F95 game metadata, RSS-driven update state, and module-owned UI contributions.',
  installerComponentId: F95_MODULE_ID,
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
      id: 'f95.notification.feed',
      slot: 'notification.feed',
      title: 'F95 Notifications',
      description: 'F95-derived updates and sync notifications.',
      order: 100,
    },
    {
      id: 'f95.game.focus.panel',
      slot: 'game.focus.panel',
      title: 'F95 Focus Panel',
      description: 'Focused game metadata sourced from F95 state.',
      order: 100,
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
    lastSuccessfulSyncAt: null,
    lastProcessedItemId: null,
    lastProcessedPublishedAt: null,
    lastSyncError: '',
  }),
};