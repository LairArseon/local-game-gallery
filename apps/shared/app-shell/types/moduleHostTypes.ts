import type { ReactNode } from 'react';

export type ModuleHostStateValue =
  | string
  | number
  | boolean
  | null
  | ModuleHostStateValue[]
  | { [key: string]: ModuleHostStateValue };

export type ModuleHostConfigState = {
  enabled: boolean;
  state: Record<string, ModuleHostStateValue>;
};

export type KnownBuiltInModuleContributionSlot =
  | 'setup.section'
  | 'notification.feed'
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

export type BuiltInModuleRenderContext = {
  moduleId: string;
  moduleDisplayName: string;
  configState: ModuleHostConfigState;
  onConfigStateChange?: (nextConfigState: ModuleHostConfigState) => void;
  game?: ModuleHostGameLike;
  moduleTags?: ModuleHostGameTag[];
};

export type BuiltInModuleContributionDescriptor = {
  id: string;
  slot: BuiltInModuleContributionSlot;
  title?: string;
  description?: string;
  order?: number;
  render?: (context: BuiltInModuleRenderContext) => ReactNode;
  getItems?: () => BuiltInModuleNotificationDescriptor[];
};

export type BuiltInModuleDefinition = {
  id: string;
  displayName: string;
  description: string;
  installerComponentId?: string;
  enabledByDefault?: boolean;
  contributes: BuiltInModuleContributionDescriptor[];
  getDefaultState?: () => Record<string, ModuleHostStateValue>;
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

export type BuiltInModuleNotificationDescriptor = {
  id: string;
  moduleId: string;
  createdAt: string;
  title: string;
  message: string;
  gamePath?: string | null;
  severity?: 'info' | 'warn' | 'error';
  dismissible?: boolean;
  metadata?: Record<string, ModuleHostStateValue>;
};

export type BuiltInModuleHost = {
  modules: BuiltInModuleDefinition[];
};