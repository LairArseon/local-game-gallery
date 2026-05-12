import { useMemo } from 'react';
import type { ModuleHostGameLike } from '../types/moduleHostTypes';
import type { ResolvedBuiltInModule } from '../core/moduleRegistry';

type BuiltInModuleGameBadgesProps<TGame extends ModuleHostGameLike> = {
  game: TGame;
  modules: ResolvedBuiltInModule[];
};

export function BuiltInModuleGameBadges<TGame extends ModuleHostGameLike>({
  game,
  modules,
}: BuiltInModuleGameBadgesProps<TGame>) {
  const badgeEntries = useMemo(
    () => modules
      .filter((moduleEntry) => moduleEntry.configState.installed && moduleEntry.configState.enabled)
      .flatMap(({ definition, configState }) =>
        definition.contributes
          .filter((contribution) => contribution.slot === 'game.card.badge')
          .map((contribution) => ({ contribution, definition, configState }))),
    [modules],
  );

  if (!badgeEntries.length) {
    return null;
  }

  return (
    <div className="game-card__module-badges">
      {badgeEntries.map(({ contribution, definition, configState }) => {
        const moduleTagPrefix = `module_${definition.id}_`;
        const moduleTags = game.metadata.customTags.filter((tag) => tag.key.startsWith(moduleTagPrefix));

        return contribution.render ? (
          <div key={contribution.id} className="game-card__module-badge">
            {contribution.render({
              moduleId: definition.id,
              moduleDisplayName: definition.displayName,
              configState,
              game,
              moduleTags,
            })}
          </div>
        ) : null;
      })}
    </div>
  );
}