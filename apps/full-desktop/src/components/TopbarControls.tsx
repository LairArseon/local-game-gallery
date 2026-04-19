/**
 * Compact control strip for search and high-frequency top-level actions.
 *
 * This component groups search, panel toggles, setup toggle, and manual rescan
 * into one predictable row so App does not carry repetitive button markup.
 * Labels and pressed states are fully driven by props, making behavior easy to
 * test and keeping visual intent centralized.
 *
 * New to this project: this is the global control strip (search, toggles, rescan, vault); trace each callback prop to App/hook orchestration for behavior.
 */
import type { RefObject } from 'react';
import type { MouseEvent } from 'react';
import { TopbarControls as SharedTopbarControls } from '../../../shared/app-shell/components/TopbarControls';

type TopbarControlsProps = {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  isTagPoolPanelOpen: boolean;
  isFilterPanelOpen: boolean;
  isSidebarOpen: boolean;
  isVaultOpen: boolean;
  hasVaultPin: boolean;
  supportsNativeContextMenu: boolean;
  isVersionNotificationsOpen: boolean;
  isScanning: boolean;
  versionMismatchCount: number;
  onToggleTagPoolPanel: () => void;
  onToggleFilterPanel: () => void;
  onToggleSidebar: () => void;
  onToggleVault: () => void;
  onOpenVaultContextMenu: (event: MouseEvent<HTMLButtonElement>, hasVaultPin: boolean) => void;
  onToggleVersionNotifications: () => void;
  onRescan: () => void;
    onRescanWithSize?: () => void;
  actionLabels: {
    rescan: string;
    scanning: string;
    showTagPool: string;
    hideTagPool: string;
    showFilters: string;
    hideFilters: string;
    showSetup: string;
    hideSetup: string;
    showVault: string;
    hideVault: string;
    showVersionNotifications: string;
    hideVersionNotifications: string;
      rescanWithSize?: string;
  };
};

export function TopbarControls({
  searchQuery,
  onSearchQueryChange,
  searchInputRef,
  isTagPoolPanelOpen,
  isFilterPanelOpen,
  isSidebarOpen,
  isVaultOpen,
  hasVaultPin,
  supportsNativeContextMenu,
  isVersionNotificationsOpen,
  isScanning,
  versionMismatchCount,
  onToggleTagPoolPanel,
  onToggleFilterPanel,
  onToggleSidebar,
  onToggleVault,
  onOpenVaultContextMenu,
  onToggleVersionNotifications,
  onRescan,
    onRescanWithSize,
  actionLabels,
}: TopbarControlsProps) {
  return (
    <SharedTopbarControls
      searchQuery={searchQuery}
      onSearchQueryChange={onSearchQueryChange}
      searchInputRef={searchInputRef}
      isTagPoolPanelOpen={isTagPoolPanelOpen}
      isFilterPanelOpen={isFilterPanelOpen}
      isSidebarOpen={isSidebarOpen}
      isVaultOpen={isVaultOpen}
      hasVaultPin={hasVaultPin}
      supportsNativeContextMenu={supportsNativeContextMenu}
      isVersionNotificationsOpen={isVersionNotificationsOpen}
      isScanning={isScanning}
      versionMismatchCount={versionMismatchCount}
      onToggleTagPoolPanel={onToggleTagPoolPanel}
      onToggleFilterPanel={onToggleFilterPanel}
      onToggleSidebar={onToggleSidebar}
      onToggleVault={onToggleVault}
      onOpenVaultContextMenu={onOpenVaultContextMenu}
      onToggleVersionNotifications={onToggleVersionNotifications}
      onRescan={onRescan}
        onRescanWithSize={onRescanWithSize}
      actionLabels={actionLabels}
    />
  );
}






