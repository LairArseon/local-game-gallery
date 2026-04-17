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
import { Bell, Lock, LockOpen, RefreshCw, Settings, SlidersHorizontal, Tag, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  onOpenArchiveUpload: () => void;
  onRescan: () => void;
  actionLabels: {
    openUpload: string;
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
  onOpenArchiveUpload,
  onRescan,
  actionLabels,
}: TopbarControlsProps) {
  const { t } = useTranslation();

  return (
    <div className="topbar__actions">
      <div className="topbar__search-group">
        <label className="topbar__search" aria-label={t('topbar.searchAria')}>
          <input
            ref={searchInputRef}
            type="search"
            placeholder={t('topbar.searchPlaceholder')}
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
          />
        </label>
      </div>
      <div className="topbar__action-buttons">
        <button
          className="button button--icon-only"
          type="button"
          onClick={onOpenArchiveUpload}
          aria-label={actionLabels.openUpload}
          title={actionLabels.openUpload}
        >
          <Upload size={16} aria-hidden="true" />
        </button>
        <button
          className={`button button--icon-only ${isTagPoolPanelOpen ? 'is-active' : ''}`}
          type="button"
          onClick={onToggleTagPoolPanel}
          aria-pressed={isTagPoolPanelOpen}
          aria-label={isTagPoolPanelOpen ? actionLabels.hideTagPool : actionLabels.showTagPool}
          title={isTagPoolPanelOpen ? actionLabels.hideTagPool : actionLabels.showTagPool}
        >
          <Tag size={16} aria-hidden="true" />
        </button>
        <button
          className={`button button--primary button--icon-only ${isFilterPanelOpen ? 'is-active' : ''}`}
          type="button"
          onClick={onToggleFilterPanel}
          aria-pressed={isFilterPanelOpen}
          aria-label={isFilterPanelOpen ? actionLabels.hideFilters : actionLabels.showFilters}
          title={isFilterPanelOpen ? actionLabels.hideFilters : actionLabels.showFilters}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
        </button>
        <button
          className={`button button--icon-only ${isVaultOpen ? 'is-vault-open' : 'is-vault-closed'}`}
          type="button"
          onClick={onToggleVault}
          onContextMenu={(event) => onOpenVaultContextMenu(event, hasVaultPin)}
          aria-pressed={isVaultOpen}
          aria-label={isVaultOpen ? actionLabels.hideVault : actionLabels.showVault}
          title={isVaultOpen ? actionLabels.hideVault : actionLabels.showVault}
        >
          {isVaultOpen ? <LockOpen size={16} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
        </button>
        <button
          className={`button button--icon-only topbar-notification-button ${isVersionNotificationsOpen ? 'is-active' : ''}`}
          type="button"
          onClick={onToggleVersionNotifications}
          aria-pressed={isVersionNotificationsOpen}
          aria-label={isVersionNotificationsOpen ? actionLabels.hideVersionNotifications : actionLabels.showVersionNotifications}
          title={isVersionNotificationsOpen ? actionLabels.hideVersionNotifications : actionLabels.showVersionNotifications}
        >
          <Bell size={16} aria-hidden="true" />
          {versionMismatchCount > 0 ? (
            <span className="topbar-notification-button__count">{versionMismatchCount}</span>
          ) : null}
        </button>
        <button
          className={`button button--icon-only ${isSidebarOpen ? 'is-active' : ''}`}
          type="button"
          onClick={onToggleSidebar}
          aria-pressed={isSidebarOpen}
          aria-label={isSidebarOpen ? actionLabels.hideSetup : actionLabels.showSetup}
          title={isSidebarOpen ? actionLabels.hideSetup : actionLabels.showSetup}
        >
          <Settings size={16} aria-hidden="true" />
        </button>
        <button
          className={`button button--icon-only ${isScanning ? 'is-busy' : ''}`}
          type="button"
          onClick={onRescan}
          disabled={isScanning}
          aria-label={isScanning ? actionLabels.scanning : actionLabels.rescan}
          title={isScanning ? actionLabels.scanning : actionLabels.rescan}
        >
          <RefreshCw size={16} aria-hidden="true" className={isScanning ? 'icon-spin' : undefined} />
        </button>
      </div>
    </div>
  );
}






