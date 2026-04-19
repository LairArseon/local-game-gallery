import type { MouseEvent } from 'react';

export type GalleryViewModeLike = 'poster' | 'card' | 'compact' | 'expanded';

export type GameVersionDisplayLike = {
  name: string;
  path: string;
  hasNfo: boolean;
  storageState: 'compressed' | 'decompressed';
  storageArchivePath?: string | null;
};

export type GameDisplayLike = {
  path: string;
  name: string;
  sizeBytes: number | null;
  usesPlaceholderArt: boolean;
  imageCount: number;
  hasVersionMismatch: boolean;
  isVaulted: boolean;
  detectedLatestVersion: string;
  lastPlayedAt: string | null;
  createdPicturesFolder: boolean;
  createdGameNfo: boolean;
  createdVersionNfoCount: number;
  media: {
    poster: string | null;
    card: string | null;
    screenshots: string[];
  };
  metadata: {
    latestVersion: string;
    status: string;
    score: string;
    description: string;
    notes: string[];
    tags: string[];
  };
  versions: GameVersionDisplayLike[];
};

export type GameCardActionLabels = {
  play: string;
  open: string;
};

export type FocusCardActionLabels = {
  play: string;
  playByVersion: string;
  open: string;
};

export type SharedGameCardProps<TGame extends GameDisplayLike = GameDisplayLike> = {
  game: TGame;
  viewMode: GalleryViewModeLike;
  isSelected: boolean;
  isNarrowViewport: boolean;
  canLaunch: boolean;
  actionLabels: GameCardActionLabels;
  getImageSrc: (filePath: string | null) => string | null;
  onToggleSelection: (path: string) => void;
  onPlayClick: (game: TGame, event: MouseEvent<HTMLButtonElement>) => void;
  onOpenDetail: (game: TGame, event: MouseEvent<HTMLButtonElement>) => void;
  onResolveVersionMismatch: (game: TGame, event: MouseEvent<HTMLButtonElement>) => void;
  onContextMenu: (game: TGame, event: MouseEvent<HTMLElement>) => void;
};

export type SharedFocusCardProps<TGame extends GameDisplayLike = GameDisplayLike> = {
  game: TGame;
  isVertical: boolean;
  showActions?: boolean;
  canLaunch: boolean;
  carouselIndex: number;
  getImageSrc: (filePath: string | null) => string | null;
  onMoveCarousel: (delta: number) => void;
  onOpenScreenshot: (imagePath: string) => void;
  onPlayClick: (game: TGame, event: MouseEvent<HTMLButtonElement>) => void;
  onPlayWithVersionPromptClick: (game: TGame, event: MouseEvent<HTMLButtonElement>) => void;
  onOpenDetail: (game: TGame, event: MouseEvent<HTMLButtonElement>) => void;
  onResolveVersionMismatch: (game: TGame, event: MouseEvent<HTMLButtonElement>) => void;
  actionLabels: FocusCardActionLabels;
  formatLastPlayedValue?: (value: string | null) => string;
};
