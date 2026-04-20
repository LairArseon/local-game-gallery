import { createPortal } from 'react-dom';
import { useState } from 'react';
import { useGalleryDiagnostics } from './useGalleryDiagnostics';

type PosterCardDebugStats = {
  isVirtualized: boolean;
  renderedCount: number;
  totalCount: number;
  startRow: number;
  endRow: number;
  totalRows: number;
};

type DebugOverlayPortalProps = {
  enabled: boolean;
  showMarker: boolean;
  showVirtualizationToast: boolean;
  diagnosticsEnabled: boolean;
  viewMode: string;
  visibleCount: number;
  totalCount: number;
  isNarrowViewport: boolean;
  forceVirtualization: boolean;
  posterCardDebugStats: PosterCardDebugStats | null;
};

export function DebugOverlayPortal({
  enabled,
  showMarker,
  showVirtualizationToast,
  diagnosticsEnabled,
  viewMode,
  visibleCount,
  totalCount,
  isNarrowViewport,
  forceVirtualization,
  posterCardDebugStats,
}: DebugOverlayPortalProps) {
  const canRender = enabled && typeof document !== 'undefined';
  const { scrollY, exportDiagnostics } = useGalleryDiagnostics(canRender && diagnosticsEnabled);
  const [lastExportStatus, setLastExportStatus] = useState<string>('');

  if (!canRender || (!showMarker && !showVirtualizationToast && !diagnosticsEnabled)) {
    return null;
  }

  return createPortal(
    <>
      {showMarker ? (
        <div
          style={{
            position: 'fixed',
            right: '16px',
            top: '12px',
            zIndex: 260,
            pointerEvents: 'none',
            padding: '7px 11px',
            borderRadius: '999px',
            border: '1px solid rgba(245, 199, 114, 0.62)',
            background: 'rgba(35, 25, 11, 0.9)',
            boxShadow: '0 10px 24px rgba(0, 0, 0, 0.45)',
            color: 'rgba(255, 232, 192, 0.98)',
            fontSize: '0.76rem',
            lineHeight: 1.2,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          debug marker | y {scrollY} | mode {viewMode} | visible {visibleCount}/{totalCount}
        </div>
      ) : null}

      {showVirtualizationToast && posterCardDebugStats ? (
        <div
          style={{
            position: 'fixed',
            right: '16px',
            top: '48px',
            zIndex: 250,
            pointerEvents: 'none',
            padding: '6px 10px',
            borderRadius: '999px',
            border: '1px solid rgba(255, 255, 255, 0.24)',
            background: 'rgba(8, 11, 18, 0.84)',
            boxShadow: '0 10px 24px rgba(0, 0, 0, 0.4)',
            color: 'rgba(247, 246, 242, 0.94)',
            fontSize: '0.75rem',
            lineHeight: 1.25,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          cards {posterCardDebugStats.renderedCount}/{posterCardDebugStats.totalCount} | visible {posterCardDebugStats.totalCount}/{totalCount} | rows {posterCardDebugStats.startRow + 1}-{Math.max(posterCardDebugStats.startRow + 1, posterCardDebugStats.endRow)}/{Math.max(1, posterCardDebugStats.totalRows)} | y {scrollY} | {posterCardDebugStats.isVirtualized ? 'virtual' : 'full'} | nv {isNarrowViewport ? 1 : 0} | dbg {forceVirtualization ? 1 : 0}
        </div>
      ) : null}

      {diagnosticsEnabled ? (
        <div
          style={{
            position: 'fixed',
            right: '16px',
            top: '84px',
            zIndex: 270,
            display: 'grid',
            gap: '4px',
            justifyItems: 'end',
          }}
        >
          <button
            type="button"
            onClick={() => {
              const didExport = exportDiagnostics({
                viewMode,
                visibleCount,
                totalCount,
                renderedCount: posterCardDebugStats?.renderedCount ?? visibleCount,
                isVirtualized: posterCardDebugStats?.isVirtualized ?? false,
                startRow: posterCardDebugStats?.startRow ?? 0,
                endRow: posterCardDebugStats?.endRow ?? 0,
                totalRows: posterCardDebugStats?.totalRows ?? 0,
                isNarrowViewport,
                forceVirtualization,
              });
              setLastExportStatus(didExport ? 'metrics exported' : 'export failed');
            }}
            style={{
              pointerEvents: 'auto',
              border: '1px solid rgba(136, 210, 255, 0.62)',
              background: 'rgba(18, 37, 52, 0.94)',
              color: 'rgba(216, 243, 255, 0.98)',
              borderRadius: '10px',
              padding: '6px 10px',
              fontSize: '0.74rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Export Metrics JSON
          </button>
          {lastExportStatus ? (
            <div
              style={{
                pointerEvents: 'none',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(8, 11, 18, 0.84)',
                color: 'rgba(247, 246, 242, 0.92)',
                borderRadius: '999px',
                padding: '3px 8px',
                fontSize: '0.7rem',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {lastExportStatus}
            </div>
          ) : null}
        </div>
      ) : null}
    </>,
    document.body,
  );
}
