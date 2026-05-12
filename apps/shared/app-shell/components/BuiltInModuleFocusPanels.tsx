import { useMemo } from 'react';
import type { ModuleHostGameLike } from '../types/moduleHostTypes';
import type { ResolvedBuiltInModule } from '../core/moduleRegistry';

type BuiltInModuleFocusPanelsProps<TGame extends ModuleHostGameLike> = {
  game: TGame;
  modules: ResolvedBuiltInModule[];
};

export function BuiltInModuleFocusPanels<TGame extends ModuleHostGameLike>({
  game,
  modules,
}: BuiltInModuleFocusPanelsProps<TGame>) {
  const focusEntries = useMemo(
    () => modules
      .filter((moduleEntry) => moduleEntry.configState.installed && moduleEntry.configState.enabled)
      .flatMap(({ definition, configState }) =>
        definition.contributes
          .filter((contribution) => contribution.slot === 'game.focus.panel')
          .map((contribution) => ({ contribution, definition, configState }))),
    [modules],
  );

  if (!focusEntries.length) {
    return null;
  }

  return (
    <div className="focus-card__module-panels">
      {focusEntries.map(({ contribution, definition, configState }) => {
        const moduleTagPrefix = `module_${definition.id}_`;
        const moduleTags = game.metadata.customTags.filter((tag) => tag.key.startsWith(moduleTagPrefix));
        const content = contribution.render ? contribution.render({
          moduleId: definition.id,
          moduleDisplayName: definition.displayName,
          configState,
          game,
          moduleTags,
        }) : null;

        return content ? (
          <section key={contribution.id} className="focus-card__module-panel">
            {content}
          </section>
        ) : null;
      })}
    </div>
  );
}