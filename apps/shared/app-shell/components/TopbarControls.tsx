import { useEffect, useRef, useState, type RefObject } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
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
  onOpenVaultContextMenu: (event: ReactMouseEvent<HTMLButtonElement>, hasVaultPin: boolean) => void;
  onToggleVersionNotifications: () => void;
  onOpenArchiveUpload?: () => void;
  onRescan: () => void;
  onRescanWithSize?: () => void;
  actionLabels: {
    openUpload?: string;
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
  onOpenArchiveUpload,
  onRescan,
  onRescanWithSize,
  actionLabels,
}: TopbarControlsProps) {
  const { t } = useTranslation();
  const contextMenuMinViewportGapPx = 8;
  const contextMenuEstimatedWidthPx = 220;
  const [rescanMenu, setRescanMenu] = useState<{ x: number; y: number } | null>(null);
  const rescanMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!rescanMenu) {
      return;
    }

    const closeMenuIfOutside = (event: globalThis.MouseEvent) => {
      const targetNode = event.target as Node | null;
      if (targetNode && rescanMenuRef.current?.contains(targetNode)) {
        return;
      }

      setRescanMenu(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setRescanMenu(null);
      }
    };

    window.addEventListener('mousedown', closeMenuIfOutside, true);
    window.addEventListener('contextmenu', closeMenuIfOutside, true);
    window.addEventListener('keydown', onKeyDown, true);

    return () => {
      window.removeEventListener('mousedown', closeMenuIfOutside, true);
      window.removeEventListener('contextmenu', closeMenuIfOutside, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [rescanMenu]);

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
        {onOpenArchiveUpload && actionLabels.openUpload ? (
          <button
            className="button button--icon-only"
            type="button"
            onClick={onOpenArchiveUpload}
            aria-label={actionLabels.openUpload}
            title={actionLabels.openUpload}
          >
            <Upload size={16} aria-hidden="true" />
          </button>
        ) : null}
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
          onContextMenu={(event) => {
            if (!onRescanWithSize || isScanning) {
              return;
            }

            event.preventDefault();
            const viewportWidth = window.innerWidth;
            const overflowsRight = event.clientX + contextMenuEstimatedWidthPx > viewportWidth - contextMenuMinViewportGapPx;
            const menuX = overflowsRight
              ? Math.max(contextMenuMinViewportGapPx, event.clientX - contextMenuEstimatedWidthPx)
              : event.clientX;
            setRescanMenu({ x: menuX, y: event.clientY });
          }}
          disabled={isScanning}
          aria-label={isScanning ? actionLabels.scanning : actionLabels.rescan}
          title={isScanning ? actionLabels.scanning : actionLabels.rescan}
        >
          <RefreshCw size={16} aria-hidden="true" className={isScanning ? 'icon-spin' : undefined} />
        </button>
        {rescanMenu && onRescanWithSize ? (
          <div
            ref={rescanMenuRef}
            className="context-menu"
            style={{ left: `${rescanMenu.x}px`, top: `${rescanMenu.y}px` }}
            role="menu"
            aria-label={actionLabels.rescan}
          >
            <button
              type="button"
              className="context-menu__item"
              role="menuitem"
              onClick={() => {
                setRescanMenu(null);
                onRescanWithSize();
              }}
            >
              {actionLabels.rescanWithSize ?? t('actions.rescanWithSize')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
