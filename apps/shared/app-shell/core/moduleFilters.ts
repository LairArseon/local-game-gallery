import type { FilterOrderByMode, ModuleTagRule } from '../types';
import type { ModuleGameFilterData, ModuleHostGameLike } from '../types/moduleHostTypes';
import type { ResolvedBuiltInModule } from './moduleRegistry';

export type ModuleTagOption = {
  moduleId: string;
  tag: string;
  count: number;
  sourceLabel: string;
  accentClassName: string;
};

export type ResolvedModuleFilter = {
  moduleId: string;
  sourceLabel: string;
  accentClassName: string;
  scoreOrderModes: { asc: FilterOrderByMode; desc: FilterOrderByMode };
  gameData: Map<string, ModuleGameFilterData>;
};

export function resolveModuleFilters(modules: ResolvedBuiltInModule[], games: ModuleHostGameLike[]): ResolvedModuleFilter[] {
  return modules
    .filter((module) => module.configState.installed && module.configState.enabled)
    .flatMap(({ definition }) => definition.contributes
      .filter((contribution) => contribution.slot === 'gallery.filters')
      .flatMap(({ filterData }) => filterData ? [{
        moduleId: definition.id,
        sourceLabel: filterData.sourceLabel,
        accentClassName: filterData.accentClassName,
        scoreOrderModes: filterData.scoreOrderModes,
        gameData: new Map(games.map((game) => [game.path, filterData.getGameData(game)])),
      }] : []));
}

export function buildModuleTagPool(
  filters: ResolvedModuleFilter[],
  games: Array<{ path: string; isVaulted?: boolean }>,
  isVaultOpen: boolean,
): ModuleTagOption[] {
  return filters.flatMap((filter) => {
    const tags = new Map<string, ModuleTagOption>();
    for (const game of games) {
      if (!isVaultOpen && game.isVaulted) {
        continue;
      }
      const gameTags = new Set<string>();
      for (const value of filter.gameData.get(game.path)?.tags ?? []) {
        const tag = value.trim();
        const key = tag.toLowerCase();
        if (!key || gameTags.has(key)) {
          continue;
        }
        gameTags.add(key);
        const entry = tags.get(key);
        if (entry) {
          entry.count += 1;
        } else {
          tags.set(key, {
            moduleId: filter.moduleId,
            sourceLabel: filter.sourceLabel,
            accentClassName: filter.accentClassName,
            tag,
            count: 1,
          });
        }
      }
    }
    return [...tags.values()].sort((left, right) => right.count - left.count
      || left.tag.localeCompare(right.tag, undefined, { sensitivity: 'base' }));
  });
}

export function moduleTagKey(rule: Pick<ModuleTagRule, 'moduleId' | 'tag'>) {
  return JSON.stringify([rule.moduleId, rule.tag.trim().toLowerCase()]);
}

export function addModuleTagRules(current: ModuleTagRule[], incoming: ModuleTagRule[]) {
  const keys = new Set(current.map(moduleTagKey));
  const additions = incoming.filter((rule) => {
    const key = moduleTagKey(rule);
    if (!rule.tag.trim() || keys.has(key)) {
      return false;
    }
    keys.add(key);
    return true;
  });
  return additions.length ? [...current, ...additions] : current;
}

export function getModuleScoreFilter(filters: ResolvedModuleFilter[], orderBy: FilterOrderByMode) {
  return filters.find((filter) => filter.scoreOrderModes.asc === orderBy || filter.scoreOrderModes.desc === orderBy);
}

export function isModuleScoreOrder(orderBy: FilterOrderByMode) {
  return orderBy === 'f95-score-asc' || orderBy === 'f95-score-desc';
}

export function compareModuleScores(left: number | null | undefined, right: number | null | undefined, ascending: boolean) {
  const leftMissing = left == null || !Number.isFinite(left);
  const rightMissing = right == null || !Number.isFinite(right);
  if (leftMissing || rightMissing) {
    return leftMissing === rightMissing ? 0 : leftMissing ? 1 : -1;
  }
  return ascending ? left - right : right - left;
}
