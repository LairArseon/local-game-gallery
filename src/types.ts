export type GalleryViewMode = 'poster' | 'card' | 'compact' | 'expanded';

export type GalleryConfig = {
  gamesRoot: string;
  excludePatterns: string[];
  hideDotEntries: boolean;
  versionFolderPattern: string;
  picturesFolderName: string;
  preferredViewMode: GalleryViewMode;
  posterColumns: number;
  cardColumns: number;
};

export type VersionSummary = {
  name: string;
  path: string;
  hasNfo: boolean;
};

export type GameMetadataTag = {
  key: string;
  value: string;
};

export type GameMetadata = {
  latestVersion: string;
  score: string;
  description: string;
  notes: string[];
  tags: string[];
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
  hasNfo: boolean;
  picturesPath: string | null;
  imageCount: number;
  usesPlaceholderArt: boolean;
  createdPicturesFolder: boolean;
  createdGameNfo: boolean;
  createdVersionNfoCount: number;
  metadata: GameMetadata;
  media: GameMediaAssets;
  versionCount: number;
  versions: VersionSummary[];
};

export type ScanResult = {
  rootPath: string;
  scannedAt: string;
  games: GameSummary[];
  warnings: string[];
};

export type GameContextMenuPayload = {
  gamePath: string;
  gameName: string;
};

export type GameContextMenuAction = {
  action: 'open' | 'play' | 'edit-metadata' | 'manage-pictures';
  gamePath: string;
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

export type GalleryApi = {
  getConfig: () => Promise<GalleryConfig>;
  saveConfig: (config: GalleryConfig) => Promise<GalleryConfig>;
  pickGamesRoot: () => Promise<string | null>;
  scanGames: () => Promise<ScanResult>;
  showGameContextMenu: (payload: GameContextMenuPayload) => Promise<void>;
  onGameContextMenuAction: (callback: (payload: GameContextMenuAction) => void) => () => void;
  saveGameMetadata: (payload: SaveGameMetadataPayload) => Promise<void>;
  importGameMediaFromDialog: (payload: ImportGameMediaPayload) => Promise<void>;
  importDroppedGameMedia: (payload: ImportDroppedGameMediaPayload) => Promise<void>;
};

declare global {
  interface Window {
    gallery: GalleryApi;
  }
}
