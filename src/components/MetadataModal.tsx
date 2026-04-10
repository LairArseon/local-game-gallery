/**
 * Metadata editor modal, including tag bubble editing and autocomplete.
 */
import type { KeyboardEvent } from 'react';
import { CustomSelect } from './CustomSelect';
import type { GameMetadata } from '../types';

type TagAutocompleteState = {
  scope: 'pool' | 'filter' | 'metadata';
  index: number;
  highlighted: number;
} | null;

type MetadataModalProps = {
  metadataDraft: GameMetadata;
  statusChoices: string[];
  activeMetadataTagEditorIndex: number | null;
  activeTagAutocomplete: TagAutocompleteState;
  activeTagSuggestions: string[];
  isMetadataSaving: boolean;
  onClose: () => void;
  onSave: () => void;
  onSetMetadataDraft: (updater: GameMetadata | ((current: GameMetadata) => GameMetadata)) => void;
  onSetActiveMetadataTagEditorIndex: (value: number | null | ((current: number | null) => number | null)) => void;
  onSetActiveTagAutocomplete: (value: TagAutocompleteState | ((current: TagAutocompleteState) => TagAutocompleteState)) => void;
  onHandleTagAutocompleteKeyDown: (event: KeyboardEvent<HTMLInputElement>, scope: 'pool' | 'filter' | 'metadata', index: number) => void;
  onApplyTagSuggestion: (scope: 'pool' | 'filter' | 'metadata', index: number, suggestion: string) => void;
};

export function MetadataModal({
  metadataDraft,
  statusChoices,
  activeMetadataTagEditorIndex,
  activeTagAutocomplete,
  activeTagSuggestions,
  isMetadataSaving,
  onClose,
  onSave,
  onSetMetadataDraft,
  onSetActiveMetadataTagEditorIndex,
  onSetActiveTagAutocomplete,
  onHandleTagAutocompleteKeyDown,
  onApplyTagSuggestion,
}: MetadataModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal-panel modal-panel--metadata" onClick={(event) => event.stopPropagation()}>
        <header className="modal-panel__header">
          <h2>Edit Metadata</h2>
          <button className="button" type="button" onClick={onClose}>Close</button>
        </header>
        <div className="modal-panel__body modal-panel__body--metadata">
          <div className="modal-panel__column">
            <label className="field">
              <span>Latest version</span>
              <input type="text" value={metadataDraft.latestVersion} onChange={(event) => onSetMetadataDraft({ ...metadataDraft, latestVersion: event.target.value })} />
            </label>
            <label className="field">
              <span>Score</span>
              <input type="text" value={metadataDraft.score} onChange={(event) => onSetMetadataDraft({ ...metadataDraft, score: event.target.value })} />
            </label>
            <label className="field">
              <span>Status</span>
              <CustomSelect
                ariaLabel="Metadata status"
                value={metadataDraft.status}
                options={[
                  { value: '', label: 'Not set' },
                  ...statusChoices.map((statusOption) => ({ value: statusOption, label: statusOption })),
                ]}
                onChange={(nextValue) => onSetMetadataDraft({ ...metadataDraft, status: nextValue })}
              />
            </label>
            <label className="field">
              <span>Description</span>
              <textarea rows={4} value={metadataDraft.description} onChange={(event) => onSetMetadataDraft({ ...metadataDraft, description: event.target.value })} />
            </label>
            <div className="modal-group">
              <div className="modal-group__header">
                <strong>Notes</strong>
                <button className="button button--icon" type="button" onClick={() => onSetMetadataDraft({ ...metadataDraft, notes: [...metadataDraft.notes, ''] })}>Add note</button>
              </div>
              {metadataDraft.notes.map((note, index) => (
                <div className="tag-row" key={`note-${index}`}>
                  <textarea rows={2} value={note} onChange={(event) => onSetMetadataDraft({ ...metadataDraft, notes: metadataDraft.notes.map((entry, noteIndex) => noteIndex === index ? event.target.value : entry) })} />
                  <button className="button button--icon" type="button" onClick={() => onSetMetadataDraft({ ...metadataDraft, notes: metadataDraft.notes.filter((_, noteIndex) => noteIndex !== index) || [''] })}>Remove</button>
                </div>
              ))}
            </div>
          </div>

          <div className="modal-panel__column modal-panel__column--tags">
            <div className="modal-group modal-group--tight">
              <div className="modal-group__header">
                <strong>Tags</strong>
              </div>
              <p className="topbar-filters__hint">Click a bubble to edit. Right-click a bubble to remove.</p>
              <div className="tag-bubbles">
                {metadataDraft.tags.map((tag, index) => {
                  const isEditing = activeMetadataTagEditorIndex === index;
                  const bubbleLabel = tag.trim() || 'Empty tag';

                  if (isEditing) {
                    return (
                      <div className="tag-bubble tag-bubble--editing" key={`core-tag-${index}`}>
                        <div className="tag-autocomplete">
                          <input
                            type="text"
                            autoFocus
                            value={tag}
                            placeholder="example: roguelike"
                            onFocus={() => onSetActiveTagAutocomplete({ scope: 'metadata', index, highlighted: 0 })}
                            onBlur={() => {
                              window.setTimeout(() => {
                                onSetMetadataDraft((current) => {
                                  const nextValue = (current.tags[index] ?? '').trim();
                                  if (nextValue) {
                                    return current;
                                  }

                                  return {
                                    ...current,
                                    tags: current.tags.filter((_, tagIndex) => tagIndex !== index),
                                  };
                                });
                                onSetActiveMetadataTagEditorIndex((current) => (current === index ? null : current));
                                onSetActiveTagAutocomplete((current) => {
                                  if (!current || current.scope !== 'metadata' || current.index !== index) {
                                    return current;
                                  }

                                  return null;
                                });
                              }, 100);
                            }}
                            onKeyDown={(event) => {
                              onHandleTagAutocompleteKeyDown(event, 'metadata', index);
                              if (event.key === 'Enter' || event.key === 'Escape') {
                                onSetActiveMetadataTagEditorIndex(null);
                                onSetActiveTagAutocomplete(null);
                              }
                            }}
                            onChange={(event) => {
                              onSetMetadataDraft({
                                ...metadataDraft,
                                tags: metadataDraft.tags.map((entry, tagIndex) => (tagIndex === index ? event.target.value : entry)),
                              });
                              onSetActiveTagAutocomplete({ scope: 'metadata', index, highlighted: 0 });
                            }}
                          />
                          {activeTagAutocomplete?.scope === 'metadata' && activeTagAutocomplete.index === index && activeTagSuggestions.length ? (
                            <div className="tag-autocomplete__menu">
                              {activeTagSuggestions.map((suggestion, suggestionIndex) => (
                                <button
                                  key={`${suggestion}-${suggestionIndex}`}
                                  className={`tag-autocomplete__item ${activeTagAutocomplete.highlighted === suggestionIndex ? 'tag-autocomplete__item--active' : ''}`}
                                  type="button"
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    onApplyTagSuggestion('metadata', index, suggestion);
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
                      key={`core-tag-${index}`}
                      className="tag-bubble"
                      type="button"
                      title={bubbleLabel}
                      onClick={() => {
                        onSetActiveMetadataTagEditorIndex(index);
                        onSetActiveTagAutocomplete({ scope: 'metadata', index, highlighted: 0 });
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        onSetMetadataDraft({
                          ...metadataDraft,
                          tags: metadataDraft.tags.filter((_, tagIndex) => tagIndex !== index),
                        });
                        onSetActiveMetadataTagEditorIndex(null);
                        onSetActiveTagAutocomplete(null);
                      }}
                    >
                      {bubbleLabel}
                    </button>
                  );
                })}
                <button
                  className="tag-bubble tag-bubble--add"
                  type="button"
                  onClick={() => {
                    const nextIndex = metadataDraft.tags.length;
                    onSetMetadataDraft({ ...metadataDraft, tags: [...metadataDraft.tags, ''] });
                    onSetActiveMetadataTagEditorIndex(nextIndex);
                    onSetActiveTagAutocomplete({ scope: 'metadata', index: nextIndex, highlighted: 0 });
                  }}
                  title="Add tag"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>
        <footer className="modal-panel__footer">
          <button className="button" type="button" onClick={onClose}>Cancel</button>
          <button className="button button--primary" type="button" disabled={isMetadataSaving} onClick={onSave}>
            {isMetadataSaving ? 'Saving...' : 'Save metadata'}
          </button>
        </footer>
      </section>
    </div>
  );
}
