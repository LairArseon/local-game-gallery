/**
 * Content scaling model for typography, spacing, and media density.
 */
import { useMemo, type CSSProperties } from 'react';

const dynamicScaleBaselineColumns: Record<'poster' | 'card', number> = {
  poster: 5,
  card: 4,
};

type SharedConfigScale = {
  uiDynamicGridScaling?: boolean;
  uiGlobalZoom?: number;
  uiBaseFontScale?: number;
  uiBaseSpacingScale?: number;
  uiMetadataGapScale?: number;
};

type UseContentScaleArgs = {
  config: SharedConfigScale | null;
  viewMode: string;
  gridColumns: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function useContentScale({ config, viewMode, gridColumns }: UseContentScaleArgs) {
  const dynamicUiScaleFactor = useMemo(() => {
    if (!config?.uiDynamicGridScaling) {
      return 1;
    }

    if (viewMode !== 'poster' && viewMode !== 'card') {
      return 1;
    }

    const baselineColumns = dynamicScaleBaselineColumns[viewMode];
    const activeColumns = Math.max(1, gridColumns || baselineColumns);
    const ratio = baselineColumns / activeColumns;

    return clamp(Math.pow(ratio, 0.5), 0.75, 1.25);
  }, [config?.uiDynamicGridScaling, viewMode, gridColumns]);

  const effectiveGlobalZoom = clamp(config?.uiGlobalZoom ?? 1, 0.75, 2);
  const effectiveFontScale = clamp((config?.uiBaseFontScale ?? 1) * dynamicUiScaleFactor * effectiveGlobalZoom, 0.6, 2.4);
  const effectiveSpacingScale = clamp((config?.uiBaseSpacingScale ?? 1) * dynamicUiScaleFactor * effectiveGlobalZoom, 0.6, 2.4);
  const metadataGapSetting = config?.uiMetadataGapScale ?? 1;
  const effectiveMetadataGapScale = clamp((metadataGapSetting * 0.5) * effectiveFontScale, 0.12, 3);
  const effectiveMediaScale = clamp((effectiveFontScale + effectiveSpacingScale) / 2, 0.7, 1.6);

  const contentScaleStyle = {
    ['--content-font-scale' as string]: effectiveFontScale.toFixed(3),
    ['--content-spacing-scale' as string]: effectiveSpacingScale.toFixed(3),
    ['--metadata-gap-scale' as string]: effectiveMetadataGapScale.toFixed(3),
    ['--content-media-scale' as string]: effectiveMediaScale.toFixed(3),
  } as CSSProperties;

  return {
    effectiveMediaScale,
    contentScaleStyle,
  };
}
