import { type Dispatch, type RefObject, type SetStateAction } from 'react';
import { useResponsiveGrid as useSharedResponsiveGrid } from '../../../shared/app-shell/hooks/useResponsiveGrid';
import type { GalleryConfig, GalleryViewMode } from '../types';
import { clamp } from '../utils/app-helpers';

type UseResponsiveGridArgs = {
  viewMode: GalleryViewMode;
  cardsContainerRef: RefObject<HTMLDivElement | null>;
  effectiveMediaScale: number;
  filteredGamesLength: number;
  detailGamePath: string | null;
  config: GalleryConfig | null;
  setGridColumns: Dispatch<SetStateAction<number>>;
};

export function useResponsiveGrid(args: UseResponsiveGridArgs) {
  useSharedResponsiveGrid<GalleryConfig, GalleryViewMode>({
    ...args,
    clamp,
  });
}
