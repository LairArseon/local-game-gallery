/**
 * Staged filter editor UI for tag rules, ordering, status, and presets.
 */
import type { KeyboardEvent } from 'react';
import { CustomSelect } from './CustomSelect';
import type { FilterOrderByMode, FilterPreset } from '../types';

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
  return (
    <section className="topbar-filters">
      <div className="topbar-filters__grid">
        <div className="topbar-filters__group">
          <div className="topbar-filters__heading">
            <strong>Tag rules</strong>
          </div>
          <p className="topbar-filters__hint">Click a bubble to edit. Right-click a bubble to remove. Prefix with - to exclude.</p>
          <div className="tag-bubbles">
            {draftTagRules.map((rule, index) => {
              const isEditing = activeFilterRuleEditorIndex === index;
              const normalizedRule = rule.trim();
              const isExclude = normalizedRule.startsWith('-');
              const bubbleLabel = normalizedRule || 'Empty tag';

              if (isEditing) {
                return (
                  <div className="tag-bubble tag-bubble--editing" key={`filter-rule-${index}`}>
                    <div className="tag-autocomplete">
                      <input
                        type="text"
                        autoFocus
                        value={rule}
                        placeholder="example: roguelike or -horror"
                        onFocus={() => onSetActiveTagAutocomplete({ scope: 'filter', index, highlighted: 0 })}
                        onBlur={() => {
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
                    onRemoveRule(index);
                  }}
                >
                  {bubbleLabel}
                </button>
              );
            })}
            <button className="tag-bubble tag-bubble--add" type="button" onClick={onAddRule} title="Add tag rule">
              +
            </button>
          </div>
          <div className="topbar-filters__suggestions">
            <p className="topbar-filters__hint">Top used tags right now. Click to add as a filter.</p>
            <div className="tag-bubbles">
              {topUsedFilterSuggestions.map((entry) => (
                <button
                  key={`suggestion-${entry.tag}`}
                  className="tag-bubble tag-bubble--suggested"
                  type="button"
                  onClick={() => onAddSuggestionTag(entry.tag)}
                  title={`Used in ${entry.count} game${entry.count === 1 ? '' : 's'}`}
                >
                  <span>{entry.tag}</span>
                  <span className="tag-bubble__metric">{entry.count}</span>
                </button>
              ))}
              {!topUsedFilterSuggestions.length ? (
                <p className="topbar-filters__hint topbar-filters__hint--inline">No available suggestions.</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="topbar-filters__group">
          <div className="topbar-filters__quick">
            <label className="field topbar-filters__field">
              <span>Minimum score</span>
              <input
                type="number"
                step="0.1"
                min="0"
                value={draftMinScore}
                onChange={(event) => onChangeDraftMinScore(event.target.value)}
                placeholder="Leave empty to ignore"
              />
            </label>

            <label className="field topbar-filters__field">
              <span>Order by</span>
              <CustomSelect
                className="custom-select--order"
                ariaLabel="Order by"
                value={draftOrderBy}
                options={(Object.keys(orderByModeLabels) as FilterOrderByMode[]).map((mode) => ({
                  value: mode,
                  label: orderByModeLabels[mode],
                }))}
                onChange={(nextValue) => onChangeDraftOrderBy(nextValue as FilterOrderByMode)}
              />
            </label>

            <label className="field topbar-filters__field topbar-filters__field--full">
              <span>Status</span>
              <CustomSelect
                ariaLabel="Filter status"
                value={draftStatus}
                options={[
                  { value: '', label: 'Any status' },
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
              <strong>Presets</strong>
              {!isPresetNamingOpen ? (
                <button className="button button--icon" type="button" onClick={onBeginSavePreset}>
                  Save preset
                </button>
              ) : null}
            </div>
            {isPresetNamingOpen ? (
              <div className="topbar-presets__create">
                <input
                  type="text"
                  value={draftPresetName}
                  autoFocus
                  placeholder="Preset name"
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
                    {isPresetSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button className="button button--icon" type="button" onClick={onCancelPresetNaming}>
                    Cancel
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
                        Load
                      </button>
                      <button className="button button--icon" type="button" onClick={() => onDeleteFilterPreset(preset.name)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="topbar-filters__hint">No saved presets yet.</p>
            )}
          </section>
        </div>
      </div>

      <div className="topbar-filters__actions">
        <button className="button" type="button" onClick={onResetStagedFilters}>
          Reset staged
        </button>
        <button className="button button--primary" type="button" onClick={onApplyFiltersAndOrdering}>
          Apply
        </button>
      </div>
    </section>
  );
}
