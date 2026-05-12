import type {
  BuiltInModuleContributionDescriptor,
  BuiltInModuleContributionSlot,
  BuiltInModuleDefinition,
  ModuleHostConfigState,
} from '../types/moduleHostTypes';

export type ResolvedBuiltInModule = {
  definition: BuiltInModuleDefinition;
  configState: ModuleHostConfigState;
};

function compareModules(left: BuiltInModuleDefinition, right: BuiltInModuleDefinition) {
  return left.displayName.localeCompare(right.displayName, undefined, { sensitivity: 'base' });
}

function compareContributionDescriptors(
  left: BuiltInModuleContributionDescriptor,
  right: BuiltInModuleContributionDescriptor,
) {
  return (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id, undefined, { sensitivity: 'base' });
}

function normalizeContributionDescriptors(contributions: BuiltInModuleContributionDescriptor[] | null | undefined) {
  const seenContributionIds = new Set<string>();
  const normalizedContributions: BuiltInModuleContributionDescriptor[] = [];

  for (const contribution of contributions ?? []) {
    const normalizedId = String(contribution.id).trim();
    const normalizedSlot = String(contribution.slot).trim() as BuiltInModuleContributionSlot;
    if (!normalizedId || !normalizedSlot || seenContributionIds.has(normalizedId)) {
      continue;
    }

    seenContributionIds.add(normalizedId);
    normalizedContributions.push({
      ...contribution,
      id: normalizedId,
      slot: normalizedSlot,
      title: String(contribution.title ?? '').trim() || undefined,
      description: String(contribution.description ?? '').trim() || undefined,
    });
  }

  normalizedContributions.sort(compareContributionDescriptors);
  return normalizedContributions;
}

export function createBuiltInModuleRegistry(definitions: BuiltInModuleDefinition[]) {
  const seenModuleIds = new Set<string>();
  const modules: BuiltInModuleDefinition[] = [];

  for (const definition of definitions) {
    const normalizedId = String(definition.id).trim();
    if (!normalizedId || seenModuleIds.has(normalizedId)) {
      continue;
    }

    seenModuleIds.add(normalizedId);
    modules.push({
      ...definition,
      id: normalizedId,
      displayName: String(definition.displayName).trim() || normalizedId,
      description: String(definition.description).trim(),
      installerComponentId: String(definition.installerComponentId ?? '').trim() || undefined,
      enabledByDefault: Boolean(definition.enabledByDefault),
      contributes: normalizeContributionDescriptors(definition.contributes),
    });
  }

  modules.sort(compareModules);

  return {
    getAll() {
      return [...modules];
    },
    getById(moduleId: string) {
      const normalizedId = String(moduleId).trim();
      return modules.find((moduleDefinition) => moduleDefinition.id === normalizedId) ?? null;
    },
    getContributions(slot: BuiltInModuleContributionSlot, moduleIds?: string[]) {
      const normalizedSlot = String(slot).trim();
      const allowedModuleIds = moduleIds ? new Set(moduleIds.map((moduleId) => String(moduleId).trim()).filter(Boolean)) : null;

      return modules
        .filter((moduleDefinition) => !allowedModuleIds || allowedModuleIds.has(moduleDefinition.id))
        .flatMap((moduleDefinition) => moduleDefinition.contributes)
        .filter((contribution) => contribution.slot === normalizedSlot)
        .sort(compareContributionDescriptors);
    },
  };
}

export function resolveModuleConfigState(
  moduleDefinition: BuiltInModuleDefinition,
  configuredState: ModuleHostConfigState | null | undefined,
): ModuleHostConfigState {
  return {
    enabled: configuredState?.enabled ?? Boolean(moduleDefinition.enabledByDefault),
    state: configuredState?.state ?? (moduleDefinition.getDefaultState?.() ?? {}),
  };
}

export function listEnabledModuleIds(
  moduleDefinitions: BuiltInModuleDefinition[],
  configuredStates: Record<string, ModuleHostConfigState> | null | undefined,
) {
  return moduleDefinitions
    .filter((moduleDefinition) => resolveModuleConfigState(moduleDefinition, configuredStates?.[moduleDefinition.id]).enabled)
    .map((moduleDefinition) => moduleDefinition.id);
}

export function resolveConfiguredModules(
  moduleDefinitions: BuiltInModuleDefinition[],
  configuredStates: Record<string, ModuleHostConfigState> | null | undefined,
): ResolvedBuiltInModule[] {
  return moduleDefinitions.map((definition) => ({
    definition,
    configState: resolveModuleConfigState(definition, configuredStates?.[definition.id]),
  }));
}