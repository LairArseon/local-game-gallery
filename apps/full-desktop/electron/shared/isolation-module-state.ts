import type { GalleryConfig } from '../../src/types';

const isolationModuleId = 'isolation';

export function isIsolationModuleActive(config: Pick<GalleryConfig, 'modules'> | null | undefined) {
  const moduleState = config?.modules?.[isolationModuleId];
  if (!moduleState) {
    return true;
  }

  return moduleState.installed !== false && moduleState.enabled !== false;
}
