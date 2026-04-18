import type { MouseEvent } from 'react';
import type { GalleryViewMode, GameSummary } from '../types';
import { GameCard as SharedGameCard } from '../../../shared/app-shell/components/GameCard';

type GameCardProps = {
  game: GameSummary;
  viewMode: GalleryViewMode;
  isSelected: boolean;
  isNarrowViewport: boolean;
  canLaunch: boolean;
  actionLabels: {
    play: string;
    open: string;
  };
  getImageSrc: (filePath: string | null) => string | null;
  onToggleSelection: (path: string) => void;
  onPlayClick: (game: GameSummary, event: MouseEvent<HTMLButtonElement>) => void;
  onOpenDetail: (game: GameSummary, event: MouseEvent<HTMLButtonElement>) => void;
  onResolveVersionMismatch: (game: GameSummary, event: MouseEvent<HTMLButtonElement>) => void;
  onContextMenu: (game: GameSummary, event: MouseEvent<HTMLElement>) => void;
};

export function GameCard(props: GameCardProps) {
  return <SharedGameCard {...props} />;
}