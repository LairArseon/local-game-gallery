import type { BuiltInModuleDefinition, BuiltInModuleManifest, BuiltInModuleManifestContribution } from '../types/moduleHostTypes';
import { MODULE_HOST_API_VERSION } from '../types/moduleHostTypes';
import { createBuiltInModuleRegistry } from './moduleRegistry';

const emptyBuiltInModuleRegistry = createBuiltInModuleRegistry([]);

type LoadBuiltInModuleRegistryOptions = {
  onError?: (message: string, source?: string) => void | Promise<void>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeManifestContribution(value: unknown): BuiltInModuleManifestContribution | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const id = String(value.id ?? '').trim();
  const slot = String(value.slot ?? '').trim();
  if (!id || !slot) {
    return null;
  }

  return {
    id,
    slot,
    title: String(value.title ?? '').trim() || undefined,
    description: String(value.description ?? '').trim() || undefined,
    order: typeof value.order === 'number' && Number.isFinite(value.order) ? value.order : undefined,
  };
}

function normalizeManifest(value: unknown): BuiltInModuleManifest | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const id = String(value.id ?? '').trim();
  const displayName = String(value.displayName ?? '').trim();
  const version = String(value.version ?? '').trim();
  const entry = String(value.entry ?? '').trim();
  const hostApiVersion = String(value.hostApiVersion ?? '').trim();

  if (!id || !displayName || !version || !entry || !hostApiVersion) {
    return null;
  }

  return {
    id,
    displayName,
    description: String(value.description ?? '').trim() || undefined,
    version,
    entry,
    hostApiVersion,
    installerComponentId: String(value.installerComponentId ?? '').trim() || undefined,
    contributes: Array.isArray(value.contributes)
      ? value.contributes
        .map((contribution) => normalizeManifestContribution(contribution))
        .filter((contribution): contribution is BuiltInModuleManifestContribution => Boolean(contribution))
      : [],
  };
}

function resolveRuntimeModuleIndexUrl() {
  if (typeof document === 'undefined' || !document.baseURI) {
    return null;
  }

  return new URL('modules/module-index.js', document.baseURI).href;
}

async function importRuntimeModule(moduleUrl: string) {
  return import(/* @vite-ignore */ moduleUrl);
}

function extractInstalledModuleManifests(moduleExports: Record<string, unknown>) {
  const rawManifests = moduleExports.installedModuleManifests ?? moduleExports.default ?? moduleExports.modules;
  if (!Array.isArray(rawManifests)) {
    return [] as BuiltInModuleManifest[];
  }

  return rawManifests
    .map((manifest) => normalizeManifest(manifest))
    .filter((manifest): manifest is BuiltInModuleManifest => Boolean(manifest));
}

function extractModuleDefinition(moduleExports: Record<string, unknown>): BuiltInModuleDefinition | null {
  const rawDefinition = moduleExports.moduleEntry ?? moduleExports.builtInModule ?? moduleExports.moduleDefinition ?? moduleExports.default;
  if (!rawDefinition || !isPlainObject(rawDefinition)) {
    return null;
  }

  return rawDefinition as unknown as BuiltInModuleDefinition;
}

export async function loadBuiltInModuleRegistry(options: LoadBuiltInModuleRegistryOptions = {}) {
  const moduleIndexUrl = resolveRuntimeModuleIndexUrl();
  if (!moduleIndexUrl) {
    return emptyBuiltInModuleRegistry;
  }

  let moduleIndexExports: Record<string, unknown>;
  try {
    moduleIndexExports = await importRuntimeModule(moduleIndexUrl) as Record<string, unknown>;
  } catch {
    return emptyBuiltInModuleRegistry;
  }

  const installedModuleManifests = extractInstalledModuleManifests(moduleIndexExports);
  if (!installedModuleManifests.length) {
    return emptyBuiltInModuleRegistry;
  }

  const loadedDefinitions: BuiltInModuleDefinition[] = [];

  for (const manifest of installedModuleManifests) {
    if (manifest.hostApiVersion !== MODULE_HOST_API_VERSION) {
      await options.onError?.(
        `Skipping module ${manifest.id}: incompatible host API version ${manifest.hostApiVersion}.`,
        `module:${manifest.id}/compatibility`,
      );
      continue;
    }

    const moduleEntryUrl = new URL(manifest.entry, moduleIndexUrl).href;

    try {
      const moduleEntryExports = await importRuntimeModule(moduleEntryUrl) as Record<string, unknown>;
      const moduleDefinition = extractModuleDefinition(moduleEntryExports);
      if (!moduleDefinition) {
        await options.onError?.(
          `Skipping module ${manifest.id}: entrypoint did not export a module definition.`,
          `module:${manifest.id}/entrypoint`,
        );
        continue;
      }

      if (String(moduleDefinition.id ?? '').trim() !== manifest.id) {
        await options.onError?.(
          `Skipping module ${manifest.id}: manifest and entrypoint ids do not match.`,
          `module:${manifest.id}/manifest`,
        );
        continue;
      }

      loadedDefinitions.push(moduleDefinition);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
      await options.onError?.(
        `Skipping module ${manifest.id}: failed to load packaged entrypoint (${message}).`,
        `module:${manifest.id}/load`,
      );
    }
  }

  return createBuiltInModuleRegistry(loadedDefinitions);
}

export function getBuiltInModuleRegistry() {
  return emptyBuiltInModuleRegistry;
}