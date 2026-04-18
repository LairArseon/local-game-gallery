import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomSelect } from './CustomSelect';
import type { FilterOrderByModeLike, FilterPresetLike } from '../types/filterManagerTypes';
import type { FilterPanelProps } from '../types/filterPanelTypes';

const filterOrderByModes: FilterOrderByModeLike[] = ['alpha-asc', 'alpha-desc', 'score-asc', 'score-desc'];

type PresetContextMenuState = {
  x: number;
  y: number;
  presetName: string;
} | null;

export function FilterPanel<
  TOrderBy extends FilterOrderByModeLike,
  TPreset extends FilterPresetLike<TOrderBy>,
>({
  draftTagRules,
  activeFilterRuleEditorIndex,
  activeTagAutocomplete,
  activeTagSuggestions,
  topUsedFilterSuggestions,
  draftMinScore,
  draftOrderBy,
  draftStatus,
  orderByModeLabels,
  statusChoices,
  isPresetNamingOpen,
  draftPresetName,
  isPresetSaving,
  filterPresets,
  onSetActiveTagAutocomplete,
  onStartEditRule,
  onRemoveRule,
  onFinalizeRuleBlur,
  onHandleRuleKeyDown,
  onUpdateRule,
  onApplyRuleSuggestion,
  onAddRule,
  onAddSuggestionTag,
  onChangeDraftMinScore,
  onChangeDraftOrderBy,
  onChangeDraftStatus,
  onBeginSavePreset,
  onChangeDraftPresetName,
  onSaveCurrentFilterPreset,
  onCancelPresetNaming,
  onRenameFilterPreset,
  onLoadFilterPreset,
  onDeleteFilterPreset,
  onResetStagedFilters,
}: FilterPanelProps<TOrderBy, TPreset>) {
  const { t } = useTranslation();
  const [presetContextMenu, setPresetContextMenu] = useState<PresetContextMenuState>(null);
  const [activePresetRenameName, setActivePresetRenameName] = useState<string | null>(null);
  const [draftPresetRenameName, setDraftPresetRenameName] = useState('');
  const presetContextMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!presetContextMenu) {
      return;
    }

    const closeContextMenuIfOutside = (event: MouseEvent) => {
      const targetNode = event.target as Node | null;
      if (targetNode && presetContextMenuRef.current?.contains(targetNode)) {
        return;
      }

      setPresetContextMenu(null);
    };

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPresetContextMenu(null);
      }
    };

    window.addEventListener('mousedown', closeContextMenuIfOutside, true);
    window.addEventListener('contextmenu', closeContextMenuIfOutside, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('mousedown', closeContextMenuIfOutside, true);
      window.removeEventListener('contextmenu', closeContextMenuIfOutside, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [presetContextMenu]);

  useEffect(() => {
    if (!activePresetRenameName) {
      return;
    }

    const renameTargetExists = filterPresets.some((preset) => preset.name === activePresetRenameName);
    if (!renameTargetExists) {
      setActivePresetRenameName(null);
      setDraftPresetRenameName('');
    }
  }, [activePresetRenameName, filterPresets]);

  function beginPresetRename(name: string) {
    setActivePresetRenameName(name);
    setDraftPresetRenameName(name);
    setPresetContextMenu(null);
  }

  function finalizePresetRename(currentName: string) {
    const nextName = draftPresetRenameName.trim();
    setActivePresetRenameName(null);
    setDraftPresetRenameName('');

    if (!nextName || nextName.toLowerCase() === currentName.trim().toLowerCase()) {
      return;
    }

    onRenameFilterPreset(currentName, nextName);
  }

  return (
    <section className="topbar-filters">
      <div className="topbar-filters__grid">
        <div className="topbar-filters__group">
          <div className="topbar-filters__heading">
            <strong>{t('filters.tagRules')}</strong>
          </div>
          <p className="topbar-filters__hint">{t('filters.tagRulesHint')}</p>
          <div className="tag-bubbles">
            {draftTagRules.map((rule, index) => {
              const isEditing = activeFilterRuleEditorIndex === index;
              const normalizedRule = rule.trim();
              const isExclude = normalizedRule.startsWith('-');
              const bubbleLabel = normalizedRule || t('filters.emptyTag');

              if (isEditing) {
                return (
                  <div className="tag-bubble tag-bubble--editing" key={`filter-rule-${index}`}>
                    <div className="tag-autocomplete">
                      <input
                        type="text"
                        autoFocus
                        value={rule}
                        placeholder={t('filters.rulePlaceholder')}
                        onFocus={() => onSetActiveTagAutocomplete({ scope: 'filter', index, highlighted: 0 })}
                        onBlur={() => {
                          window.setTimeout(() => {
                            onFinalizeRuleBlur(index);
                          }, 100);
                        }}
                        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => onHandleRuleKeyDown(event, index)}
                        onChange={(event) => {
                          onUpdateRule(index, event.target.value);
                          onSetActiveTagAutocomplete({ scope: 'filter', index, highlighted: 0 });
                        }}
                      />
                      {activeTagAutocomplete?.scope === 'filter' && activeTagAutocomplete.index === index && activeTagSuggestions.length ? (
                        <div className="tag-autocomplete__menu">
                          {activeTagSuggestions.map((suggestion, suggestionIndex) => (
                            <button
                              key={`${suggestion}-${suggestionIndex}`}
                              className={`tag-autocomplete__item ${activeTagAutocomplete.highlighted === suggestionIndex ? 'tag-autocomplete__item--active' : ''}`}
                              type="button"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                onApplyRuleSuggestion(index, suggestion);
                              }}
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              }

              return (
                <button
                  key={`filter-rule-${index}`}
                  className={`tag-bubble ${isExclude ? 'tag-bubble--exclude' : ''}`}
                  type="button"
                  title={bubbleLabel}
                  onClick={() => onStartEditRule(index)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onRemoveRule(index);
                  }}
                >
                  {bubbleLabel}
                </button>
              );
            })}
            <button className="tag-bubble tag-bubble--add" type="button" onClick={onAddRule} title={t('filters.addTagRule')}>
              +
            </button>
          </div>
          <div className="topbar-filters__suggestions">
            <p className="topbar-filters__hint">{t('filters.topUsedHint')}</p>
            <div className="tag-bubbles">
              {topUsedFilterSuggestions.map((entry) => (
                <button
                  key={`suggestion-${entry.tag}`}
                  className="tag-bubble tag-bubble--suggested"
                  type="button"
                  onClick={() => onAddSuggestionTag(entry.tag)}
                  title={t('filters.usedInGames', { count: entry.count })}
                >
                  <span>{entry.tag}</span>
                  <span className="tag-bubble__metric">{entry.count}</span>
                </button>
              ))}
              {!topUsedFilterSuggestions.length ? (
                <p className="topbar-filters__hint topbar-filters__hint--inline">{t('filters.noSuggestions')}</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="topbar-filters__group">
          <div className="topbar-filters__quick">
            <label className="field topbar-filters__field">
              <span>{t('filters.minimumScore')}</span>
              <input
                type="number"
                step="0.1"
                min="0"
                value={draftMinScore}
                onChange={(event) => onChangeDraftMinScore(event.target.value)}
                placeholder={t('filters.minimumScorePlaceholder')}
              />
            </label>

            <label className="field topbar-filters__field">
              <span>{t('filters.orderBy')}</span>
              <CustomSelect
                className="custom-select--order"
                ariaLabel={t('filters.orderBy')}
                value={draftOrderBy}
                options={filterOrderByModes.map((mode) => ({
                  value: mode,
                  label: orderByModeLabels[mode as TOrderBy],
                }))}
                onChange={(nextValue) => onChangeDraftOrderBy(nextValue as TOrderBy)}
              />
            </label>

            <label className="field topbar-filters__field topbar-filters__field--full">
              <span>{t('filters.status')}</span>
              <CustomSelect
                ariaLabel={t('filters.filterStatusAria')}
                value={draftStatus}
                options={[
                  { value: '', label: t('filters.anyStatus') },
                  ...statusChoices.map((statusOption) => ({ value: statusOption, label: statusOption })),
                ]}
                onChange={onChangeDraftStatus}
              />
            </label>
          </div>
        </div>

        <div className="topbar-filters__group topbar-filters__group--presets">
          <section className="topbar-presets">
            <div className="topbar-filters__heading">
              <strong>{t('filters.presets')}</strong>
              {!isPresetNamingOpen ? (
                <button className="button button--icon" type="button" onClick={onBeginSavePreset}>
                  {t('filters.savePreset')}
                </button>
              ) : null}
            </div>
            {isPresetNamingOpen ? (
              <div className="topbar-presets__create">
                <input
                  type="text"
                  value={draftPresetName}
                  autoFocus
                  placeholder={t('filters.presetNamePlaceholder')}
                  onChange={(event) => onChangeDraftPresetName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onSaveCurrentFilterPreset();
                    }
                  }}
                />
                <div className="topbar-presets__create-actions">
                  <button className="button button--icon" type="button" disabled={isPresetSaving} onClick={onSaveCurrentFilterPreset}>
                    {isPresetSaving ? t('actions.saving') : t('filters.save')}
                  </button>
                  <button className="button button--icon" type="button" onClick={onCancelPresetNaming}>
                    {t('filters.cancel')}
                  </button>
                </div>
              </div>
            ) : null}
            {filterPresets.length ? (
              <div className="topbar-presets__list">
                {filterPresets.map((preset) => (
                  <div
                    className="topbar-presets__item"
                    key={preset.name}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setPresetContextMenu({
                        x: event.clientX,
                        y: event.clientY,
                        presetName: preset.name,
                      });
                    }}
                  >
                    {activePresetRenameName === preset.name ? (
                      <input
                        className="topbar-presets__rename-input"
                        type="text"
                        autoFocus
                        value={draftPresetRenameName}
                        onChange={(event) => setDraftPresetRenameName(event.target.value)}
                        onBlur={() => {
                          finalizePresetRename(preset.name);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            finalizePresetRename(preset.name);
                          }

                          if (event.key === 'Escape') {
                            event.preventDefault();
                            setActivePresetRenameName(null);
                            setDraftPresetRenameName('');
                          }
                        }}
                      />
                    ) : (
                      <button
                        className="topbar-presets__item-main"
                        type="button"
                        onClick={() => onLoadFilterPreset(preset)}
                      >
                        <span className="topbar-presets__item-main-text">{preset.name}</span>
                      </button>
                    )}
                    <button
                      className="topbar-presets__item-delete"
                      type="button"
                      aria-label={t('filters.delete')}
                      title={t('filters.delete')}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteFilterPreset(preset.name);
                      }}
                    >
                      -
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="topbar-filters__hint">{t('filters.noPresets')}</p>
            )}

            {presetContextMenu ? (
              <div
                className="context-menu"
                ref={presetContextMenuRef}
                style={{ left: presetContextMenu.x, top: presetContextMenu.y }}
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <button
                  className="context-menu__item"
                  type="button"
                  onClick={() => {
                    beginPresetRename(presetContextMenu.presetName);
                  }}
                >
                  {t('filters.rename')}
                </button>
                <button
                  className="context-menu__item context-menu__item--danger"
                  type="button"
                  onClick={() => {
                    onDeleteFilterPreset(presetContextMenu.presetName);
                    setPresetContextMenu(null);
                  }}
                >
                  {t('filters.delete')}
                </button>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <div className="topbar-filters__actions">
        <button className="button topbar-filters__action-button topbar-filters__action-button--reset" type="button" onClick={onResetStagedFilters}>
          {t('filters.resetStaged')}
        </button>
      </div>
    </section>
  );
}

