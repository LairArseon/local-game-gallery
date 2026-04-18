import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';

type GalleryViewModeLike = 'poster' | 'card' | 'compact' | 'expanded';

type GridConfigLike = {
  posterColumns?: number;
  cardColumns?: number;
};

const gridGapPx = 18;
const narrowViewportMaxWidthPx = 760;
const narrowViewportMinColumns = {
  poster: 3,
  card: 2,
} as const;

const gridMinCardWidthPx: Record<GalleryViewModeLike, number> = {
  poster: 210,
  card: 320,
  compact: 1,
  expanded: 1,
};

type UseResponsiveGridArgs<TConfig extends GridConfigLike, TViewMode extends GalleryViewModeLike> = {
  viewMode: TViewMode;
  cardsContainerRef: RefObject<HTMLDivElement | null>;
  effectiveMediaScale: number;
  filteredGamesLength: number;
  detailGamePath: string | null;
  config: TConfig | null;
  setGridColumns: Dispatch<SetStateAction<number>>;
  clamp: (value: number, min: number, max: number) => number;
};

export function useResponsiveGrid<TConfig extends GridConfigLike, TViewMode extends GalleryViewModeLike>({
  viewMode,
  cardsContainerRef,
  effectiveMediaScale,
  filteredGamesLength,
  detailGamePath,
  config,
  setGridColumns,
  clamp,
}: UseResponsiveGridArgs<TConfig, TViewMode>) {
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
  }, [viewMode, cardsContainerRef, effectiveMediaScale, filteredGamesLength, detailGamePath, config?.posterColumns, config?.cardColumns, setGridColumns, clamp]);
}
