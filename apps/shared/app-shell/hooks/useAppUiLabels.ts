/**
 * Localized label map factory for App-level controls.
 *
 * This hook memoizes translation-driven label objects for shared control groups
 * (actions, view modes, ordering modes) so App can pass stable maps to child
 * components without rebuilding string tables at each render.
 */
import { useMemo } from 'react';

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function useAppUiLabels(t: Translate) {
  const actionLabels = useMemo(() => ({
    openUpload: t('actions.openUpload'),
    play: t('actions.play'),
    playByVersion: t('actions.playByVersion'),
    open: t('actions.open'),
    back: t('actions.back'),
    rescan: t('actions.rescan'),
    rescanWithSize: t('actions.rescanWithSize'),
    scanning: t('actions.scanning'),
    showTagPool: t('actions.showTagPool'),
    hideTagPool: t('actions.hideTagPool'),
    showFilters: t('actions.showFilters'),
    hideFilters: t('actions.hideFilters'),
    showSetup: t('actions.showSetup'),
    hideSetup: t('actions.hideSetup'),
    showVault: t('actions.showVault'),
    hideVault: t('actions.hideVault'),
    showVersionNotifications: t('actions.showVersionNotifications'),
    hideVersionNotifications: t('actions.hideVersionNotifications'),
    chooseLibraryFolder: t('actions.chooseLibraryFolder'),
    saving: t('actions.saving'),
  } as const), [t]);

  const viewModeLabels = useMemo(() => ({
    poster: t('viewMode.poster'),
    card: t('viewMode.card'),
    compact: t('viewMode.compact'),
    expanded: t('viewMode.expanded'),
  }), [t]);

  const orderByModeLabels = useMemo(() => ({
    'alpha-asc': t('orderBy.alpha-asc'),
    'alpha-desc': t('orderBy.alpha-desc'),
    'score-asc': t('orderBy.score-asc'),
    'score-desc': t('orderBy.score-desc'),
    'size-asc': t('orderBy.size-asc'),
    'size-desc': t('orderBy.size-desc'),
  }), [t]);

  return {
    actionLabels,
    viewModeLabels,
    orderByModeLabels,
  };
}
