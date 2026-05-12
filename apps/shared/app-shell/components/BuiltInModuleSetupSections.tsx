import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModuleHostConfigState } from '../types/moduleHostTypes';
import type { ResolvedBuiltInModule } from '../core/moduleRegistry';

type BuiltInModuleSetupSectionsProps = {
  modules: ResolvedBuiltInModule[];
  onConfigStateChange: (moduleId: string, nextConfigState: ModuleHostConfigState) => void;
};

export function BuiltInModuleSetupSections({
  modules,
  onConfigStateChange,
}: BuiltInModuleSetupSectionsProps) {
  const { t } = useTranslation();

  const setupEntries = useMemo(
    () => modules.flatMap(({ definition, configState }) =>
      definition.contributes
        .filter((contribution) => contribution.slot === 'setup.section')
        .map((contribution) => ({ contribution, definition, configState }))),
    [modules],
  );

  if (!setupEntries.length) {
    return null;
  }

  return (
    <section className="field setup-modules">
      <div className="setup-modules__header">
        <span>{t('setup.modulesTitle')}</span>
        <small className="field__hint">{t('setup.modulesHint')}</small>
      </div>
      {setupEntries.map(({ contribution, definition, configState }) => (
        <section key={contribution.id} className="setup-module-card">
          <div className="setup-module-card__header">
            <div className="setup-module-card__copy">
              <strong>{contribution.title ?? definition.displayName}</strong>
              <p>{contribution.description ?? definition.description}</p>
            </div>
            <label className="field field--toggle setup-module-card__toggle">
              <span>{t('setup.moduleEnabled')}</span>
              <input
                type="checkbox"
                checked={configState.enabled}
                onChange={(event) => {
                  onConfigStateChange(definition.id, {
                    ...configState,
                    enabled: event.target.checked,
                  });
                }}
              />
            </label>
          </div>
          {contribution.render ? (
            <div className="setup-module-card__content">
              {contribution.render({
                moduleId: definition.id,
                moduleDisplayName: definition.displayName,
                configState,
                onConfigStateChange: (nextConfigState) => onConfigStateChange(definition.id, nextConfigState),
              })}
            </div>
          ) : null}
        </section>
      ))}
    </section>
  );
}