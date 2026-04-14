/**
 * Staged filter editor for rules, ordering, status constraints, and presets.
 *
 * The panel separates draft filter edits from applied gallery state so users can
 * experiment before committing changes. It supports tag autocomplete, exclusion
 * syntax (prefix with '-'), quick suggestions, and preset persistence actions.
 * All state mutations are delegated via callbacks, keeping this component purely
 * presentational and easy to evolve without touching business logic.
 *
 * New to this project: this panel edits filter drafts before apply; trace its callbacks to useFilterManager to see how rules become the final filtered list.
 */
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomSelect } from './CustomSelect';
import type { FilterOrderByMode, FilterPreset } from '../types';

const filterOrderByModes: FilterOrderByMode[] = ['alpha-asc', 'alpha-desc', 'score-asc', 'score-desc'];

type TagAutocompleteState = {
  scope: 'pool' | 'filter' | 'metadata';
  index: number;
  highlighted: number;
} | null;

type TopUsedSuggestion = {
  tag: string;
  count: number;
};

type FilterPanelProps = {
  draftTagRules: string[];
  activeFilterRuleEditorIndex: number | null;
  activeTagAutocomplete: TagAutocompleteState;
  activeTagSuggestions: string[];
  topUsedFilterSuggestions: TopUsedSuggestion[];
  draftMinScore: string;
  draftOrderBy: FilterOrderByMode;
  draftStatus: string;
  orderByModeLabels: Record<FilterOrderByMode, string>;
  statusChoices: string[];
  isPresetNamingOpen: boolean;
  draftPresetName: string;
  isPresetSaving: boolean;
  filterPresets: FilterPreset[];
  onSetActiveTagAutocomplete: (value: TagAutocompleteState) => void;
  onStartEditRule: (index: number) => void;
  onRemoveRule: (index: number) => void;
  onFinalizeRuleBlur: (index: number) => void;
  onHandleRuleKeyDown: (event: KeyboardEvent<HTMLInputElement>, index: number) => void;
  onUpdateRule: (index: number, value: string) => void;
  onApplyRuleSuggestion: (index: number, suggestion: string) => void;
  onAddRule: () => void;
  onAddSuggestionTag: (tag: string) => void;
  onChangeDraftMinScore: (value: string) => void;
  onChangeDraftOrderBy: (value: FilterOrderByMode) => void;
  onChangeDraftStatus: (value: string) => void;
  onBeginSavePreset: () => void;
  onChangeDraftPresetName: (value: string) => void;
  onSaveCurrentFilterPreset: () => void;
  onCancelPresetNaming: () => void;
  onLoadFilterPreset: (preset: FilterPreset) => void;
  onDeleteFilterPreset: (name: string) => void;
  onResetStagedFilters: () => void;
  onApplyFiltersAndOrdering: () => void;
};

export function FilterPanel({
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
  onLoadFilterPreset,
  onDeleteFilterPreset,
  onResetStagedFilters,
  onApplyFiltersAndOrdering,
}: FilterPanelProps) {
  const { t } = useTranslation();

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
                          // Delay cleanup so suggestion clicks (mousedown) can commit first.
                          window.setTimeout(() => {
                            onFinalizeRuleBlur(index);
                          }, 100);
                        }}
                        onKeyDown={(event) => onHandleRuleKeyDown(event, index)}
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
                    // Right-click is the quick-remove affordance for staged rule bubbles.
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
                  label: orderByModeLabels[mode],
                }))}
                onChange={(nextValue) => onChangeDraftOrderBy(nextValue as FilterOrderByMode)}
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
                  <div className="topbar-presets__item" key={preset.name}>
                    <p>{preset.name}</p>
                    <div className="topbar-presets__item-actions">
                      <button className="button button--icon" type="button" onClick={() => onLoadFilterPreset(preset)}>
                        {t('filters.load')}
                      </button>
                      <button className="button button--icon" type="button" onClick={() => onDeleteFilterPreset(preset.name)}>
                        {t('filters.delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="topbar-filters__hint">{t('filters.noPresets')}</p>
            )}
          </section>
        </div>
      </div>

      <div className="topbar-filters__actions">
        <button className="button topbar-filters__action-button topbar-filters__action-button--reset" type="button" onClick={onResetStagedFilters}>
          {t('filters.resetStaged')}
        </button>
        <button className="button button--primary topbar-filters__action-button topbar-filters__action-button--apply" type="button" onClick={onApplyFiltersAndOrdering}>
          {t('filters.apply')}
        </button>
      </div>
    </section>
  );
}






