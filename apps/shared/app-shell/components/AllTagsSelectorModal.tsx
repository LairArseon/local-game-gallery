import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { moduleTagKey, type ModuleTagOption } from '../core/moduleFilters';
import type { ModuleTagRule } from '../types';

type TagOption = {
  tag: string;
  count: number;
};

type AllTagsSelectorModalProps = {
  availableTags: TagOption[];
  selectedTags: string[];
  availableModuleTags?: ModuleTagOption[];
  selectedModuleRules?: ModuleTagRule[];
  onAcceptModuleTags?: (tags: ModuleTagOption[]) => void;
  onClose: () => void;
  onAccept: (selectedTags: string[]) => void;
};

export function AllTagsSelectorModal({
  availableTags,
  selectedTags,
  availableModuleTags = [],
  selectedModuleRules = [],
  onAcceptModuleTags,
  onClose,
  onAccept,
}: AllTagsSelectorModalProps) {
  const { t } = useTranslation();
  const [draftSelection, setDraftSelection] = useState<string[]>(selectedTags);
  const [query, setQuery] = useState('');
  const [moduleSelection, setModuleSelection] = useState(
    () => new Set(selectedModuleRules.filter((rule) => !rule.exclude).map(moduleTagKey)),
  );
  const normalizedQuery = query.trim().toLowerCase();
  const visibleTags = availableTags.filter((entry) => entry.tag.toLowerCase().includes(normalizedQuery));
  const moduleGroups = [...new Set(availableModuleTags.map((entry) => entry.moduleId))].map((moduleId) => ({
    moduleId,
    label: availableModuleTags.find((entry) => entry.moduleId === moduleId)?.sourceLabel ?? moduleId,
    tags: availableModuleTags.filter((entry) => entry.moduleId === moduleId && entry.tag.toLowerCase().includes(normalizedQuery)),
  }));

  const selectedKeys = useMemo(
    () => new Set(draftSelection.map((tag) => tag.trim().toLowerCase()).filter(Boolean)),
    [draftSelection],
  );

  function toggleTag(tag: string) {
    const normalized = tag.trim().toLowerCase();
    setDraftSelection((current) => {
      const hasTag = current.some((entry) => entry.trim().toLowerCase() === normalized);
      if (hasTag) {
        return current.filter((entry) => entry.trim().toLowerCase() !== normalized);
      }

      return [...current, tag];
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal-panel modal-panel--metadata" onClick={(event) => event.stopPropagation()}>
        <header className="modal-panel__header">
          <h2>{t('detail.tags')}</h2>
          <button className="button" type="button" onClick={onClose}>{t('common.close')}</button>
        </header>
        <div className="modal-panel__body modal-panel__body--all-tags">
          <div className="modal-panel__column modal-panel__column--all-tags">
            <label className="field">
              <span>{t('filters.searchTags')}</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <p className="topbar-filters__hint">{t('filters.topUsedHint')}</p>
            <h3>{t('filters.normalTags')}</h3>
            <div className="tag-bubbles">
              {visibleTags.map((entry) => {
                const isSelected = selectedKeys.has(entry.tag.trim().toLowerCase());
                return (
                  <button
                    key={`${entry.tag}-${entry.count}`}
                    className={`tag-bubble tag-bubble--suggested ${isSelected ? 'tag-bubble--active' : ''}`.trim()}
                    type="button"
                    onClick={() => toggleTag(entry.tag)}
                    aria-pressed={isSelected}
                    title={t('filters.usedInGames', { count: entry.count })}
                  >
                    <span>{entry.tag}</span>
                    <span className="tag-bubble__metric">{entry.count}</span>
                  </button>
                );
              })}
            </div>
            {!visibleTags.length ? <p className="topbar-filters__hint">{t('filters.noSuggestions')}</p> : null}
            {moduleGroups.map((group) => (
              <section key={group.moduleId} aria-label={t('filters.moduleTags', { module: group.label })}>
                <h3>{t('filters.moduleTags', { module: group.label })}</h3>
                <div className="tag-bubbles">
                  {group.tags.map((entry) => {
                    const key = moduleTagKey(entry);
                    const isSelected = moduleSelection.has(key);
                    return (
                      <button
                        key={key}
                        className={`tag-bubble tag-bubble--suggested ${entry.accentClassName} ${isSelected ? 'tag-bubble--active' : ''}`}
                        type="button"
                        aria-pressed={isSelected}
                        title={t('filters.usedInGames', { count: entry.count })}
                        onClick={() => setModuleSelection((current) => {
                          const next = new Set(current);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })}
                      >
                        <span>{entry.tag}</span>
                        <span className="tag-bubble__metric">{entry.count}</span>
                      </button>
                    );
                  })}
                </div>
                {!group.tags.length ? <p className="topbar-filters__hint">{t('filters.noSuggestions')}</p> : null}
              </section>
            ))}
          </div>
        </div>
        <footer className="modal-panel__footer">
          <button className="button" type="button" onClick={onClose}>{t('common.cancel')}</button>
          <button className="button button--primary" type="button" onClick={() => {
            onAcceptModuleTags?.(availableModuleTags.filter((entry) => moduleSelection.has(moduleTagKey(entry))));
            onAccept(draftSelection);
          }}>
            {t('filters.apply')}
          </button>
        </footer>
      </section>
    </div>
  );
}