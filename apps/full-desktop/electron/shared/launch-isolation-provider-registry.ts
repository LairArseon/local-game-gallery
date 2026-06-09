import { existsSync } from 'node:fs';
import path from 'node:path';
import type { LaunchIsolationProvider } from './launch-isolation-provider';

let cachedProvider: LaunchIsolationProvider | null | undefined;

export function resolveLaunchIsolationProvider(): LaunchIsolationProvider | null {
  if (cachedProvider !== undefined) {
    return cachedProvider;
  }

  try {
    const providerModulePath = path.join(__dirname, '..', 'provider.js');
    if (!existsSync(providerModulePath)) {
      cachedProvider = null;
      return cachedProvider;
    }

    const providerModule = require(providerModulePath) as {
      isolationModuleProvider?: LaunchIsolationProvider;
      default?: LaunchIsolationProvider;
    };
    cachedProvider = providerModule.isolationModuleProvider ?? providerModule.default ?? null;
  } catch {
    cachedProvider = null;
  }

  return cachedProvider;
}