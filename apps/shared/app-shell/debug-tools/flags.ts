type GalleryDebugFlagWindow = Window & {
  __LGG_ALWAYS_DEBUG_MARKER__?: boolean;
  __LGG_DEBUG_VIRTUALIZATION__?: boolean;
  __LGG_DEBUG_DIAGNOSTICS__?: boolean;
};

export type GalleryDebugFlags = {
  showMarker: boolean;
  showVirtualizationToast: boolean;
  diagnosticsEnabled: boolean;
  forceVirtualization: boolean;
};

function isTruthyFlag(value: string | null | undefined) {
  return /^(1|true|yes|on)$/i.test(String(value ?? '').trim());
}

export function resolveGalleryDebugFlags(isDevBuild: boolean): GalleryDebugFlags {
  if (!isDevBuild) {
    return {
      showMarker: false,
      showVirtualizationToast: false,
      diagnosticsEnabled: false,
      forceVirtualization: false,
    };
  }

  if (typeof window === 'undefined') {
    return {
      showMarker: false,
      showVirtualizationToast: isDevBuild,
      diagnosticsEnabled: isDevBuild,
      forceVirtualization: isDevBuild,
    };
  }

  const win = window as GalleryDebugFlagWindow;
  let showMarker = false;
  let showVirtualizationToast = isDevBuild;
  let diagnosticsEnabled = isDevBuild;

  try {
    const params = new URLSearchParams(window.location.search);
    showMarker = showMarker || isTruthyFlag(params.get('debugMarker'));
    showVirtualizationToast = showVirtualizationToast
      || isTruthyFlag(params.get('debugVirtualization'))
      || isTruthyFlag(params.get('debugPerf'))
      || isTruthyFlag(params.get('lggDebug'));
    diagnosticsEnabled = diagnosticsEnabled || isTruthyFlag(params.get('debugDiagnostics'));

    showVirtualizationToast = showVirtualizationToast || window.localStorage.getItem('lgg.debugVirtualization') === '1';
    diagnosticsEnabled = diagnosticsEnabled || window.localStorage.getItem('lgg.debugDiagnostics') === '1';
  } catch {
    // Ignore storage/query failures.
  }

  showMarker = showMarker || Boolean(win.__LGG_ALWAYS_DEBUG_MARKER__);
  showVirtualizationToast = showVirtualizationToast || Boolean(win.__LGG_DEBUG_VIRTUALIZATION__);
  diagnosticsEnabled = diagnosticsEnabled || Boolean(win.__LGG_DEBUG_DIAGNOSTICS__);

  return {
    showMarker,
    showVirtualizationToast,
    diagnosticsEnabled,
    forceVirtualization: showVirtualizationToast || showMarker,
  };
}
