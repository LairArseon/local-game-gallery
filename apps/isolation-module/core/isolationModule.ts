import { createModuleLogSource } from '../../shared/app-shell/core/moduleLogSources';

export const ISOLATION_MODULE_ID = 'isolation';
export const ISOLATION_MODULE_LOG_SOURCE = createModuleLogSource(ISOLATION_MODULE_ID);

export function createDefaultIsolationModuleState() {
  return {
    preferredProvider: 'auto',
    showDiagnostics: false,
  };
}