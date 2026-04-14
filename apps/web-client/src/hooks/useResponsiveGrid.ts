/**
 * Calculates responsive column counts for poster/card grid layouts.
 *
 * The hook observes container resize events, applies scale-aware minimum card
 * widths, and respects optional user-configured column overrides. It runs only
 * for relevant view modes and keeps grid sizing logic out of App markup code.
 *
 * New to this project: this hook computes responsive column counts from container size, mode, and scale; start with the resize effect and column calculation logic.
 */
import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { GalleryConfig, GalleryViewMode } from '../types';
import { clamp } from '../utils/app-helpers';

const gridGapPx = 18;
const narrowViewportMaxWidthPx = 760;
const narrowViewportMinColumns = {
  poster: 3,
  card: 2,
} as const;

const gridMinCardWidthPx: Record<GalleryViewMode, number> = {
  poster: 210,
  card: 320,
  compact: 1,
  expanded: 1,
};

type UseResponsiveGridArgs = {
  viewMode: GalleryViewMode;
  cardsContainerRef: RefObject<HTMLDivElement | null>;
  effectiveMediaScale: number;
  filteredGamesLength: number;
  detailGamePath: string | null;
  config: GalleryConfig | null;
  setGridColumns: Dispatch<SetStateAction<number>>;
};

export function useResponsiveGrid({
  viewMode,
  cardsContainerRef,
  effectiveMediaScale,
  filteredGamesLength,
  detailGamePath,
  config,
  setGridColumns,
}: UseResponsiveGridArgs) {
  useEffect(() => {
    const activeViewMode = viewMode;
    if (activeViewMode !== 'poster' && activeViewMode !== 'card') {
      return;
    }

    const container = cardsContainerRef.current;
    if (!container) {
      return;
    }

    const minCardWidth = gridMinCardWidthPx[activeViewMode] * clamp(effectiveMediaScale, 0.7, 1.6);
    const updateColumns = () => {
      const width = container.clientWidth;
      const maxFitColumns = Math.max(1, Math.floor((width + gridGapPx) / (minCardWidth + gridGapPx)));
      const configuredColumns = activeViewMode === 'poster' ? config?.posterColumns : config?.cardColumns;
      // Respect user preference when possible, but never exceed currently available width.
      const preferredColumns = configuredColumns && configuredColumns > 0 ? configuredColumns : maxFitColumns;
      const boundedColumns = Math.max(1, Math.min(preferredColumns, maxFitColumns));
      const isNarrowViewport = window.innerWidth <= narrowViewportMaxWidthPx;
      const nextColumns = isNarrowViewport
        ? Math.max(narrowViewportMinColumns[activeViewMode], boundedColumns)
        : boundedColumns;
      setGridColumns(nextColumns);
    };

    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [viewMode, cardsContainerRef, effectiveMediaScale, filteredGamesLength, detailGamePath, config?.posterColumns, config?.cardColumns, setGridColumns]);
}






