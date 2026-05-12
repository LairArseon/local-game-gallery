import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ResolvedBuiltInModule } from '../core/moduleRegistry';
import type { ModuleHostGameLike } from '../types/moduleHostTypes';

type BuiltInModuleDetailPanelsProps<TGame extends ModuleHostGameLike> = {
  game: TGame;
  modules: ResolvedBuiltInModule[];
};

export function BuiltInModuleDetailPanels<TGame extends DetailGameLike>({
  game,
  modules,
}: BuiltInModuleDetailPanelsProps<TGame>) {
  const { t } = useTranslation();

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
      {detailEntries.map(({ contribution, definition }) => {
        const moduleTagPrefix = `module_${definition.id}_`;
        const moduleTags = game.metadata.customTags.filter((tag) => tag.key.startsWith(moduleTagPrefix));

        return (
          <section key={contribution.id} className="detail-section panel">
            <div className="detail-section__header">
              <div>
                <h3>{contribution.title ?? definition.displayName}</h3>
                <p>{contribution.description ?? definition.description}</p>
              </div>
            </div>
            {contribution.render ? contribution.render({
              moduleId: definition.id,
              moduleDisplayName: definition.displayName,
              configState,
              game,
              moduleTags,
            }) : moduleTags.length ? (
              <div className="detail-tags">
                {moduleTags.map((tag) => (
                  <p key={tag.key}>{tag.key}: {tag.value}</p>
                ))}
              </div>
            ) : <p>{t('detail.noModuleData')}</p>}
          </section>
        );
      })}
    </>
  );
}