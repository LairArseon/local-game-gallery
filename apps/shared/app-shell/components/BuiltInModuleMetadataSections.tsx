import { useMemo } from 'react';
import type { ModuleHostGameLike, ModuleHostMetadataDraftLike } from '../types/moduleHostTypes';
import type { ResolvedBuiltInModule } from '../core/moduleRegistry';

type BuiltInModuleMetadataSectionsProps = {
  game: ModuleHostGameLike;
  metadataDraft: ModuleHostMetadataDraftLike;
  modules: ResolvedBuiltInModule[];
  onMetadataDraftChange: (
    updater: ModuleHostMetadataDraftLike | ((current: ModuleHostMetadataDraftLike) => ModuleHostMetadataDraftLike)
  ) => void;
};

export function BuiltInModuleMetadataSections({
  game,
  metadataDraft,
  modules,
  onMetadataDraftChange,
}: BuiltInModuleMetadataSectionsProps) {
  const metadataEntries = useMemo(
    () => modules
      .filter((moduleEntry) => moduleEntry.configState.installed && moduleEntry.configState.enabled)
      .flatMap(({ definition, configState }) =>
        definition.contributes
          .filter((contribution) => contribution.slot === 'metadata.editor.section')
          .map((contribution) => ({ contribution, definition, configState }))),
    [modules],
  );

  if (!metadataEntries.length) {
    return null;
  }

  return (
    <div className="metadata-module-sections">
      {metadataEntries.map(({ contribution, definition, configState }) => {
        const moduleTagPrefix = `module_${definition.id}_`;
        const moduleTags = metadataDraft.customTags.filter((tag) => tag.key.startsWith(moduleTagPrefix));

        return (
          <section key={contribution.id} className="modal-group metadata-module-section">
            <div className="modal-group__header">
              <div>
                <strong>{contribution.title ?? definition.displayName}</strong>
                <p className="topbar-filters__hint">{contribution.description ?? definition.description}</p>
              </div>
            </div>
            {contribution.render ? contribution.render({
              moduleId: definition.id,
              moduleDisplayName: definition.displayName,
              configState,
              game,
              moduleTags,
              metadataDraft,
              onMetadataDraftChange,
            }) : null}
          </section>
        );
      })}
    </div>
  );
}