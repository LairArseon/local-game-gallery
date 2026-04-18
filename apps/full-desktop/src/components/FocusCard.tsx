import type { MouseEvent } from 'react';
import type { GameSummary } from '../types';
import { formatLastPlayed } from '../utils/app-helpers';
import { FocusCard as SharedFocusCard } from '../../../shared/app-shell/components/FocusCard';

type FocusCardProps = {
  game: GameSummary;
  isVertical: boolean;
  showActions?: boolean;
  canLaunch: boolean;
  carouselIndex: number;
  getImageSrc: (filePath: string | null) => string | null;
  onMoveCarousel: (delta: number) => void;
  onOpenScreenshot: (imagePath: string) => void;
  onPlayClick: (game: GameSummary, event: MouseEvent<HTMLButtonElement>) => void;
  onPlayWithVersionPromptClick: (game: GameSummary, event: MouseEvent<HTMLButtonElement>) => void;
  onOpenDetail: (game: GameSummary, event: MouseEvent<HTMLButtonElement>) => void;
  onResolveVersionMismatch: (game: GameSummary, event: MouseEvent<HTMLButtonElement>) => void;
  actionLabels: {
    play: string;
    playByVersion: string;
    open: string;
  };
};

export function FocusCard(props: FocusCardProps) {
  return <SharedFocusCard {...props} formatLastPlayedValue={formatLastPlayed} />;
}