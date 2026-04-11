/**
 * Compact control strip for search and high-frequency top-level actions.
 *
 * This component groups search, panel toggles, setup toggle, and manual rescan
 * into one predictable row so App does not carry repetitive button markup.
 * Labels and pressed states are fully driven by props, making behavior easy to
 * test and keeping visual intent centralized.
 */
import type { RefObject } from 'react';
import { RefreshCw, Settings, SlidersHorizontal, Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type TopbarControlsProps = {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  isTagPoolPanelOpen: boolean;
  isFilterPanelOpen: boolean;
  isSidebarOpen: boolean;
  isScanning: boolean;
  onToggleTagPoolPanel: () => void;
  onToggleFilterPanel: () => void;
  onToggleSidebar: () => void;
  onRescan: () => void;
  actionLabels: {
    rescan: string;
    scanning: string;
    showTagPool: string;
    hideTagPool: string;
    showFilters: string;
    hideFilters: string;
    showSetup: string;
    hideSetup: string;
  };
};

export function TopbarControls({
  searchQuery,
  onSearchQueryChange,
  searchInputRef,
  isTagPoolPanelOpen,
  isFilterPanelOpen,
  isSidebarOpen,
  isScanning,
  onToggleTagPoolPanel,
  onToggleFilterPanel,
  onToggleSidebar,
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
  );
}
