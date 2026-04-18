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
  storageState: 'compressed' | 'decompressed';
  storageArchivePath: string | null;
};

export type PlayableVersion = {
  name: string;
  path: string;
  storageState: 'compressed' | 'decompressed';
  storageArchivePath?: string | null;
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

export type GameExtraEntry = {
  name: string;
  relativePath: string;
  isDirectory: boolean;
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
  extras: GameExtraEntry[];
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
  action: 'open-version-folder' | 'compress-version' | 'decompress-version';
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
  skipDecompressPrompt?: boolean;
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

export type SaveExtraDownloadPayload = {
  gamePath: string;
  relativePath: string;
  suggestedName?: string;
};

export type SaveExtraDownloadResult = {
  saved: boolean;
  canceled: boolean;
  savedPath: string | null;
  message: string;
};

export type SaveVersionDownloadPayload = {
  gamePath: string;
  versionPath: string;
  suggestedName?: string;
};

export type SaveVersionDownloadResult = {
  saved: boolean;
  canceled: boolean;
  savedPath: string | null;
  message: string;
};

export type CompressGameVersionPayload = {
  gamePath: string;
  versionPath: string;
  versionName?: string;
};

export type CompressGameVersionResult = {
  compressed: boolean;
  archivePath: string | null;
  archiveSizeBytes: number;
  message: string;
};

export type DecompressGameVersionPayload = {
  gamePath: string;
  versionPath: string;
  versionName?: string;
};

export type DecompressGameVersionResult = {
  decompressed: boolean;
  extractedEntries: number;
  message: string;
};

export type StageGameArchiveUploadPayload = {
  fileName: string;
  mimeType?: string;
  dataBase64?: string;
  filePath?: string;
};

export type StageGameArchiveUploadResult = {
  uploadId: string;
  originalFileName: string;
  sizeBytes: number;
};

export type PickArchiveUploadFileResult = {
  filePath: string;
  fileName: string;
  sizeBytes: number;
};

export type CancelStagedGameArchiveUploadPayload = {
  uploadId: string;
};

export type ImportStagedGameArchivePayload = {
  uploadId: string;
  gameName: string;
  versionName: string;
  existingGamePath?: string;
  metadata?: GameMetadata;
};

export type ImportStagedGameArchiveResult = {
  imported: boolean;
  gamePath: string | null;
  versionPath: string | null;
  message: string;
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
  saveExtraDownload: (payload: SaveExtraDownloadPayload) => Promise<SaveExtraDownloadResult>;
  saveVersionDownload: (payload: SaveVersionDownloadPayload) => Promise<SaveVersionDownloadResult>;
  compressGameVersion: (payload: CompressGameVersionPayload) => Promise<CompressGameVersionResult>;
  decompressGameVersion: (payload: DecompressGameVersionPayload) => Promise<DecompressGameVersionResult>;
  pickArchiveUploadFile: () => Promise<PickArchiveUploadFileResult | null>;
  stageGameArchiveUpload: (payload: StageGameArchiveUploadPayload) => Promise<StageGameArchiveUploadResult>;
  cancelStagedGameArchiveUpload: (payload: CancelStagedGameArchiveUploadPayload) => Promise<void>;
  importStagedGameArchive: (payload: ImportStagedGameArchivePayload) => Promise<ImportStagedGameArchiveResult>;
};

declare global {
  interface Window {
    gallery: GalleryApi;
  }
}

