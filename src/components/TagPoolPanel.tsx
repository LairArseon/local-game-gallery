/**
 * Tag pool management panel used from the top bar.
 */
import type { KeyboardEvent } from 'react';

type TagAutocompleteState = {
  scope: 'pool' | 'filter' | 'metadata';
  index: number;
  highlighted: number;
} | null;

type TagPoolPanelProps = {
  tagPool: string[];
  tagPoolUsage: Record<string, number>;
  activeTagPoolEditorIndex: number | null;
  activeTagAutocomplete: TagAutocompleteState;
  activeTagSuggestions: string[];
  onStartEdit: (index: number) => void;
  onRemoveTag: (index: number) => void;
  onFinalizeEdit: (index: number) => void;
  onEditorValueChange: (index: number, value: string) => void;
  onSetAutocomplete: (value: TagAutocompleteState) => void;
  onEditorKeyDown: (event: KeyboardEvent<HTMLInputElement>, index: number) => void;
  onApplySuggestion: (index: number, suggestion: string) => void;
  onAddTag: () => void;
};

export function TagPoolPanel({
  tagPool,
  tagPoolUsage,
  activeTagPoolEditorIndex,
  activeTagAutocomplete,
  activeTagSuggestions,
  onStartEdit,
  onRemoveTag,
  onFinalizeEdit,
  onEditorValueChange,
  onSetAutocomplete,
  onEditorKeyDown,
  onApplySuggestion,
  onAddTag,
}: TagPoolPanelProps) {
  return (
    <section className="topbar-filters topbar-tag-pool">
      <div className="topbar-filters__heading">
        <strong>Tag pool</strong>
      </div>
      <p className="topbar-filters__hint">Click a bubble to edit. Right-click to remove only when unused by all games.</p>
      <div className="tag-bubbles">
        {tagPool.map((tag, index) => {
          const isEditing = activeTagPoolEditorIndex === index;
          const bubbleLabel = tag.trim() || 'Empty tag';
          const usageCount = Number.isFinite(tagPoolUsage?.[tag]) ? tagPoolUsage[tag] : 0;

          if (isEditing) {
            return (
              <div className="tag-bubble tag-bubble--editing" key={`pool-tag-${index}`}>
                <div className="tag-autocomplete">
                  <input
                    type="text"
                    autoFocus
                    value={tag}
                    placeholder="example: roguelike"
                    onFocus={() => onSetAutocomplete({ scope: 'pool', index, highlighted: 0 })}
                    onBlur={() => {
                      window.setTimeout(() => {
                        onFinalizeEdit(index);
                      }, 100);
                    }}
                    onKeyDown={(event) => onEditorKeyDown(event, index)}
                    onChange={(event) => {
                      onEditorValueChange(index, event.target.value);
                      onSetAutocomplete({ scope: 'pool', index, highlighted: 0 });
                    }}
                  />
                  {activeTagAutocomplete?.scope === 'pool' && activeTagAutocomplete.index === index && activeTagSuggestions.length ? (
                    <div className="tag-autocomplete__menu">
                      {activeTagSuggestions.map((suggestion, suggestionIndex) => (
                        <button
                          key={`${suggestion}-${suggestionIndex}`}
                          className={`tag-autocomplete__item ${activeTagAutocomplete.highlighted === suggestionIndex ? 'tag-autocomplete__item--active' : ''}`}
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            onApplySuggestion(index, suggestion);
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
              key={`pool-tag-${index}`}
              className="tag-bubble tag-bubble--suggested"
              type="button"
              title={`${bubbleLabel} (${usageCount} game${usageCount === 1 ? '' : 's'})`}
              onClick={() => onStartEdit(index)}
              onContextMenu={(event) => {
                event.preventDefault();
                onRemoveTag(index);
              }}
            >
              <span>{bubbleLabel}</span>
              <span className="tag-bubble__metric">{usageCount}</span>
            </button>
          );
        })}
        <button className="tag-bubble tag-bubble--add" type="button" onClick={onAddTag} title="Add pool tag">
          +
        </button>
      </div>
    </section>
  );
}
