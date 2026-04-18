/**
 * Shared App-shell default constants and initial-state helpers.
 */

type AppShellServiceCapabilities = {
  supportsLaunch: boolean;
  supportsHostFolderPicker: boolean;
  launchPolicy: 'host-desktop-only';
  supportsNativeContextMenu: boolean;
  supportsTrayLifecycle: boolean;
  clientMode: 'desktop' | 'web' | 'mobile';
  isContainerized: boolean;
  isGamesRootEditable: boolean;
};

export const narrowViewportMaxWidthPx = 760;

export const desktopCapabilitiesDefault: AppShellServiceCapabilities = {
  supportsLaunch: true,
  supportsHostFolderPicker: true,
  launchPolicy: 'host-desktop-only',
  supportsNativeContextMenu: true,
  supportsTrayLifecycle: true,
  clientMode: 'desktop',
  isContainerized: false,
  isGamesRootEditable: true,
};

export const webCapabilitiesDefault: AppShellServiceCapabilities = {
  supportsLaunch: false,
  supportsHostFolderPicker: false,
  launchPolicy: 'host-desktop-only',
  supportsNativeContextMenu: false,
  supportsTrayLifecycle: false,
  clientMode: 'web',
  isContainerized: false,
  isGamesRootEditable: true,
};

export function getInitialServiceCapabilities(hasDesktopBridge: boolean): AppShellServiceCapabilities {
  return hasDesktopBridge ? desktopCapabilitiesDefault : webCapabilitiesDefault;
}

export function createEmptyScan<TGame = never>() {
  return {
    rootPath: '',
    scannedAt: '',
    games: [] as TGame[],
    warnings: [] as string[],
    usingMirrorFallback: false,
  };
}
