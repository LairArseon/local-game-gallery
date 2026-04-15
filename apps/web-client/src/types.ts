export type ClientMode = 'desktop' | 'web' | 'mobile';
export type LaunchPolicy = 'host-desktop-only';

export type ServiceCapabilities = {
  supportsLaunch: boolean;
  supportsHostFolderPicker: boolean;
  launchPolicy: LaunchPolicy;
  supportsNativeContextMenu: boolean;
  supportsTrayLifecycle: boolean;
  clientMode: ClientMode;
  isContainerized: boolean;
  isGamesRootEditable: boolean;
};

export type ServiceHealthStatus = {
  status: 'ok' | 'degraded' | 'starting';
  startedAt: string;
  host: string;
  port: number;
  transport: 'ipc' | 'http';
};

export type ServiceApiVersionInfo = {
  apiVersion: string;
  serviceName: string;
  serviceBuild: string;
};

export const GALLERY_VIEW_MODES = ['poster', 'card', 'compact', 'expanded'] as const;
export type GalleryViewMode = (typeof GALLERY_VIEW_MODES)[number];

export const FILTER_ORDER_BY_MODES = ['alpha-asc', 'alpha-desc', 'score-asc', 'score-desc'] as const;
export type FilterOrderByMode = (typeof FILTER_ORDER_BY_MODES)[number];

export const APP_LANGUAGES = ['en', 'es'] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];

export type FilterPreset = {
  name: string;
  tagRules: string[];
  minScore: string;
  status: string;
  orderBy: FilterOrderByMode;
};

export type GalleryConfig = {
  language: AppLanguage;
  dismissedVersionMismatches: Record<string, string>;
  vaultedGamePaths: string[];
  vaultPin: string;
  gamesRoot: string;
  metadataMirrorRoot: string;
  excludePatterns: string[];
  hideDotEntries: boolean;
  versionFolderPattern: string;
  picturesFolderName: string;
  preferredViewMode: GalleryViewMode;
  posterColumns: number;
  cardColumns: number;
  uiBaseFontScale: number;
  uiBaseSpacingScale: number;
  uiMetadataGapScale: number;
  uiDynamicGridScaling: boolean;
  uiGlobalZoom: number;
  appIconPngPath: string;
  showSystemMenuBar: boolean;
  statusChoices: string[];
  tagPool: string[];
  tagPoolUsage: Record<string, number>;
  filterPresets: FilterPreset[];
};

export type AppIconInspectPayload = {
  filePath: string;
};

export type AppIconInspectResult = {
  isValid: boolean;
  message: string;
  width: number;
  height: number;
  willPadToSquare: boolean;
};

export type StageDroppedAppIconPayload = {
  fileName: string;
  buffer: ArrayBuffer;
};

export type ApplyRuntimeAppIconPayload = {
  filePath: string;
};

export type ApplyRuntimeAppIconResult = {
  applied: boolean;
  message: string;
};

export type VersionSummary = {
  name: string;
  path: string;
  hasNfo: boolean;
};

export type PlayableVersion = {
  name: string;
  path: string;
};

export type GameMetadataTag = {
  key: string;
  value: string;
};

export type GameMetadata = {
  latestVersion: string;
  score: string;
  status: string;
  description: string;
  notes: string[];
  tags: string[];
  launchExecutable: string;
  customTags: GameMetadataTag[];
};

export type GameMediaAssets = {
  poster: string | null;
  card: string | null;
  background: string | null;
  screenshots: string[];
};

export type GameSummary = {
  name: string;
  path: string;
  isVaulted: boolean;
  lastPlayedAt: string | null;
  hasNfo: boolean;
  picturesPath: string | null;
  imageCount: number;
  usesPlaceholderArt: boolean;
  createdPicturesFolder: boolean;
  createdGameNfo: boolean;
  createdVersionNfoCount: number;
  metadata: GameMetadata;
  detectedLatestVersion: string;
  hasVersionMismatch: boolean;
  isVersionMismatchDismissed: boolean;
  media: GameMediaAssets;
  versionCount: number;
  versions: VersionSummary[];
};

export type ScanResult = {
  rootPath: string;
  scannedAt: string;
  games: GameSummary[];
  warnings: string[];
  usingMirrorFallback: boolean;
};

export type ScanRequestOptions = {
  syncMirror?: boolean;
  mirrorParity?: boolean;
};

export type GameContextMenuPayload = {
  gamePath: string;
  gameName: string;
  isVaultOpen: boolean;
  isGameVaulted: boolean;
  canPlay?: boolean;
  anchorX?: number;
  anchorY?: number;
};

export type GameContextMenuAction = {
  action: 'open' | 'play' | 'edit-metadata' | 'manage-pictures' | 'open-game-folder' | 'add-to-vault' | 'remove-from-vault';
  gamePath: string;
};

export type VersionContextMenuPayload = {
  versionPath: string;
  versionName: string;
};

export type VersionContextMenuAction = {
  action: 'open-version-folder';
  versionPath: string;
};

export type VaultContextMenuPayload = {
  isVaultOpen: boolean;
  hasVaultPin: boolean;
  anchorX?: number;
  anchorY?: number;
};

export type VaultContextMenuAction = {
  action: 'add-vault-pin' | 'change-vault-pin' | 'remove-vault-pin';
};

export type OpenFolderPayload = {
  folderPath: string;
};

export type OpenFolderResult = {
  opened: boolean;
  message: string;
};

export type LogEventPayload = {
  message: string;
  level?: 'info' | 'warn' | 'error';
  source?: string;
};

export type SaveGameMetadataPayload = {
  gamePath: string;
  title: string;
  metadata: GameMetadata;
};

export type ImportGameMediaPayload = {
  gamePath: string;
  target: 'poster' | 'card' | 'background' | 'screenshot';
};

export type ImportDroppedGameMediaPayload = ImportGameMediaPayload & {
  filePaths: string[];
};

export type PlayGamePayload = {
  gamePath: string;
  gameName: string;
  versions: PlayableVersion[];
  launchMode?: 'default' | 'choose-version-temporary';
};

export type PlayGameResult = {
  launched: boolean;
  executablePath: string | null;
  message: string;
};

export type ReorderScreenshotsPayload = {
  fromPath: string;
  toPath: string;
};

export type RemoveScreenshotPayload = {
  screenshotPath: string;
};

export type GalleryApi = {
  getAppVersion: () => Promise<string>;
  getServiceCapabilities: () => Promise<ServiceCapabilities>;
  getServiceHealth: () => Promise<ServiceHealthStatus>;
  getApiVersion: () => Promise<ServiceApiVersionInfo>;
  getConfig: () => Promise<GalleryConfig>;
  saveConfig: (config: GalleryConfig) => Promise<GalleryConfig>;
  pickGamesRoot: () => Promise<string | null>;
  pickMetadataMirrorRoot: () => Promise<string | null>;
  pickAppIconPng: () => Promise<string | null>;
  inspectAppIconFile: (payload: AppIconInspectPayload) => Promise<AppIconInspectResult>;
  stageDroppedAppIcon: (payload: StageDroppedAppIconPayload) => Promise<string>;
  applyRuntimeAppIcon: (payload: ApplyRuntimeAppIconPayload) => Promise<ApplyRuntimeAppIconResult>;
  scanGames: (options?: ScanRequestOptions) => Promise<ScanResult>;
  scanGame: (gamePath: string) => Promise<GameSummary | null>;
  showGameContextMenu: (payload: GameContextMenuPayload) => Promise<void>;
  onGameContextMenuAction: (callback: (payload: GameContextMenuAction) => void) => () => void;
  showVersionContextMenu: (payload: VersionContextMenuPayload) => Promise<void>;
  onVersionContextMenuAction: (callback: (payload: VersionContextMenuAction) => void) => () => void;
  showVaultContextMenu: (payload: VaultContextMenuPayload) => Promise<void>;
  onVaultContextMenuAction: (callback: (payload: VaultContextMenuAction) => void) => () => void;
  openFolder: (payload: OpenFolderPayload) => Promise<OpenFolderResult>;
  logEvent: (payload: LogEventPayload) => Promise<void>;
  getLogContents: () => Promise<string>;
  openLogFolder: () => Promise<OpenFolderResult>;
  clearLogContents: () => Promise<void>;
  setMenuBarVisibility: (visible: boolean) => Promise<void>;
  saveGameMetadata: (payload: SaveGameMetadataPayload) => Promise<void>;
  importGameMediaFromDialog: (payload: ImportGameMediaPayload) => Promise<void>;
  importDroppedGameMedia: (payload: ImportDroppedGameMediaPayload) => Promise<void>;
  playGame: (payload: PlayGamePayload) => Promise<PlayGameResult>;
  reorderScreenshots: (payload: ReorderScreenshotsPayload) => Promise<void>;
  removeScreenshot: (payload: RemoveScreenshotPayload) => Promise<void>;
};

declare global {
  interface Window {
    gallery: GalleryApi;
  }
}
