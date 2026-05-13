import { useMemo } from 'react';
import type { ModuleHostGameLike } from '../types/moduleHostTypes';
import type { ResolvedBuiltInModule } from '../core/moduleRegistry';

type BuiltInModuleFocusPanelsProps<TGame extends ModuleHostGameLike> = {
  game: TGame;
  modules: ResolvedBuiltInModule[];
  hostSurface?: 'focus' | 'detail';
};

function supportsHostSurface(hostSurfaces: Array<'focus' | 'detail'> | undefined, hostSurface: 'focus' | 'detail') {
  if (!hostSurfaces?.length) {
    return true;
  }

  return hostSurfaces.includes(hostSurface);
}

export function BuiltInModuleFocusPanels<TGame extends ModuleHostGameLike>({
  game,
  modules,
  hostSurface = 'focus',
}: BuiltInModuleFocusPanelsProps<TGame>) {
  const focusEntries = useMemo(
    () => modules
      .filter((moduleEntry) => moduleEntry.configState.enabled)
      .flatMap(({ definition, configState }) =>
        definition.contributes
          .filter((contribution) => contribution.slot === 'game.focus.panel' && supportsHostSurface(contribution.hostSurfaces, hostSurface))
          .map((contribution) => ({ contribution, definition, configState }))),
    [hostSurface, modules],
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
          hostSurface,
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