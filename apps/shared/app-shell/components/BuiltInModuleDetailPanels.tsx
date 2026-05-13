import { useMemo } from 'react';
import type { ResolvedBuiltInModule } from '../core/moduleRegistry';
import type { ModuleHostGameLike, ModuleHostGameTag } from '../types/moduleHostTypes';

type BuiltInModuleDetailPanelsProps<TGame extends ModuleHostGameLike> = {
  game: TGame;
  modules: ResolvedBuiltInModule[];
  logAppEvent?: (message: string, level?: 'info' | 'warn' | 'error', source?: string) => Promise<void>;
  toErrorMessage?: (error: unknown, fallback: string) => string;
  onGameMetadataTagsChange?: (
    game: TGame,
    updater: ModuleHostGameTag[] | ((current: ModuleHostGameTag[]) => ModuleHostGameTag[])
  ) => Promise<void>;
};

export function BuiltInModuleDetailPanels<TGame extends ModuleHostGameLike>({
  game,
  modules,
  logAppEvent,
  toErrorMessage,
  onGameMetadataTagsChange,
}: BuiltInModuleDetailPanelsProps<TGame>) {
  const detailEntries = useMemo(
    () => modules
      .filter((moduleEntry) => moduleEntry.configState.enabled)
      .flatMap(({ definition, configState }) =>
        definition.contributes
          .filter((contribution) => contribution.slot === 'game.detail.panel')
          .map((contribution) => ({ contribution, definition, configState }))),
    [modules],
  );

  if (!detailEntries.length) {
    return null;
  }

  return (
    <>
      {detailEntries.map(({ contribution, definition, configState }) => {
        const moduleTagPrefix = `module_${definition.id}_`;
        const moduleTags = game.metadata.customTags.filter((tag) => tag.key.startsWith(moduleTagPrefix));
        const renderContext = {
          moduleId: definition.id,
          moduleDisplayName: definition.displayName,
          configState,
          logAppEvent,
          toErrorMessage,
          game,
          moduleTags,
          onGameMetadataTagsChange: onGameMetadataTagsChange
            ? (updater: ModuleHostGameTag[] | ((current: ModuleHostGameTag[]) => ModuleHostGameTag[])) => onGameMetadataTagsChange(game, updater)
            : undefined,
        };
        const content = contribution.render ? contribution.render(renderContext) : moduleTags.length ? (
          <div className="detail-tags">
            {moduleTags.map((tag) => (
              <p key={tag.key}>{tag.key}: {tag.value}</p>
            ))}
          </div>
        ) : null;
        const headerActions = contribution.renderHeaderActions ? contribution.renderHeaderActions(renderContext) : null;

        if (!content) {
          return null;
        }

        return (
          <section key={contribution.id} className="detail-section panel">
            <div className="detail-section__header">
              <div>
                <h3>{contribution.title ?? definition.displayName}</h3>
                <p>{contribution.description ?? definition.description}</p>
              </div>
              {headerActions}
            </div>
            {content}
          </section>
        );
      })}
    </>
  );
}