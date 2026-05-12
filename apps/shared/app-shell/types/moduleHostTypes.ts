import type { ReactNode } from 'react';
import type { GalleryApi, GalleryConfig, NotificationFeedItem, GameSummary } from '../types';

export type ModuleHostStateValue =
  | string
  | number
  | boolean
  | null
  | ModuleHostStateValue[]
  | { [key: string]: ModuleHostStateValue };

export type ModuleHostConfigState = {
  installed: boolean;
  enabled: boolean;
  state: Record<string, ModuleHostStateValue>;
};

export type KnownBuiltInModuleContributionSlot =
  | 'setup.section'
  | 'notification.feed'
  | 'metadata.editor.section'
  | 'game.card.badge'
  | 'game.focus.panel'
  | 'game.detail.panel';

export type BuiltInModuleContributionSlot = KnownBuiltInModuleContributionSlot | (string & {});

export type ModuleHostGameTag = {
  key: string;
  value: string;
};

export type ModuleHostGameLike = {
  path: string;
  name: string;
  metadata: {
    customTags: ModuleHostGameTag[];
  };
};

export type ModuleHostMetadataDraftLike = {
  customTags: ModuleHostGameTag[];
};

export type BuiltInModuleRenderContext = {
  moduleId: string;
  moduleDisplayName: string;
  configState: ModuleHostConfigState;
  onConfigStateChange?: (nextConfigState: ModuleHostConfigState) => void;
  game?: ModuleHostGameLike;
  moduleTags?: ModuleHostGameTag[];
  onGameMetadataTagsChange?: (
    updater: ModuleHostGameTag[] | ((current: ModuleHostGameTag[]) => ModuleHostGameTag[])
  ) => Promise<void>;
  metadataDraft?: ModuleHostMetadataDraftLike;
  onMetadataDraftChange?: (
    updater: ModuleHostMetadataDraftLike | ((current: ModuleHostMetadataDraftLike) => ModuleHostMetadataDraftLike)
  ) => void;
};

export type BuiltInModuleNotificationContext = {
  moduleId: string;
  moduleDisplayName: string;
  config: GalleryConfig;
  configState: ModuleHostConfigState;
  games: GameSummary[];
};

export type BuiltInModuleContributionDescriptor = {
  id: string;
  slot: BuiltInModuleContributionSlot;
  title?: string;
  description?: string;
  order?: number;
  render?: (context: BuiltInModuleRenderContext) => ReactNode;
  getItems?: (context: BuiltInModuleNotificationContext) => NotificationFeedItem[];
};

export type BuiltInModuleRefreshContext = {
  moduleId: string;
  moduleDisplayName: string;
  config: GalleryConfig;
  configState: ModuleHostConfigState;
  games: GameSummary[];
  galleryClient: GalleryApi;
  logAppEvent: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage: (error: unknown, fallback: string) => string;
};

export type BuiltInModuleRefreshResult = {
  nextConfigState?: ModuleHostConfigState;
  updatedGamePaths?: string[];
  notifications?: NotificationFeedItem[];
};

export type BuiltInModuleDefinition = {
  id: string;
  displayName: string;
  description: string;
  installerComponentId?: string;
  enabledByDefault?: boolean;
  contributes: BuiltInModuleContributionDescriptor[];
  getDefaultState?: () => Record<string, ModuleHostStateValue>;
  refresh?: (context: BuiltInModuleRefreshContext) => Promise<BuiltInModuleRefreshResult | null>;
};

export type BuiltInModuleSetupSection = {
  id: string;
  moduleId: string;
  title: string;
  order?: number;
  render: () => ReactNode;
};

export type BuiltInModuleGamePanel = {
  id: string;
  moduleId: string;
  title: string;
  order?: number;
  render: () => ReactNode;
};

export type BuiltInModuleHost = {
  modules: BuiltInModuleDefinition[];
};