/**
 * Metadata editing modal for core fields, notes, and tag maintenance.
 *
 * The editor supports inline bubble-style tag editing with autocomplete and
 * keyboard navigation while also handling multiline notes and status/score
 * updates. Interactions are staged in a draft object passed from state hooks,
 * allowing cancellation without side effects and save-on-demand behavior.
 *
 * New to this project: this modal edits metadata drafts and tags; follow save/autocomplete callbacks to useMetadataManager and tag helpers.
 */
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal-panel modal-panel--metadata" onClick={(event) => event.stopPropagation()}>
        <header className="modal-panel__header">
          <h2>{t('metadata.editMetadata')}</h2>
          <button className="button" type="button" onClick={onClose}>{t('common.close')}</button>
        </header>
        <div className="modal-panel__body modal-panel__body--metadata">
          <div className="modal-panel__column">
            <label className="field">
              <span>{t('metadata.latestVersion')}</span>
              <input type="text" value={metadataDraft.latestVersion} onChange={(event) => onSetMetadataDraft({ ...metadataDraft, latestVersion: event.target.value })} />
            </label>
            <label className="field">
              <span>{t('metadata.score')}</span>
              <input type="text" value={metadataDraft.score} onChange={(event) => onSetMetadataDraft({ ...metadataDraft, score: event.target.value })} />
            </label>
            <label className="field">
              <span>{t('metadata.status')}</span>
              <CustomSelect
                ariaLabel={t('metadata.statusAria')}
                value={metadataDraft.status}
                options={[
                  { value: '', label: t('detail.notSet') },
                  ...statusChoices.map((statusOption) => ({ value: statusOption, label: statusOption })),
                ]}
                onChange={(nextValue) => onSetMetadataDraft({ ...metadataDraft, status: nextValue })}
              />
            </label>
            <label className="field">
              <span>{t('metadata.description')}</span>
              <textarea rows={4} value={metadataDraft.description} onChange={(event) => onSetMetadataDraft({ ...metadataDraft, description: event.target.value })} />
            </label>
            <div className="modal-group">
              <div className="modal-group__header">
                <strong>{t('metadata.notes')}</strong>
                <button className="button button--icon" type="button" onClick={() => onSetMetadataDraft({ ...metadataDraft, notes: [...metadataDraft.notes, ''] })}>{t('metadata.addNote')}</button>
              </div>
              {metadataDraft.notes.map((note, index) => (
                <div className="tag-row" key={`note-${index}`}>
                  <textarea rows={2} value={note} onChange={(event) => onSetMetadataDraft({ ...metadataDraft, notes: metadataDraft.notes.map((entry, noteIndex) => noteIndex === index ? event.target.value : entry) })} />
                  <button className="button button--icon" type="button" onClick={() => onSetMetadataDraft({ ...metadataDraft, notes: metadataDraft.notes.filter((_, noteIndex) => noteIndex !== index) || [''] })}>{t('common.remove')}</button>
                </div>
              ))}
            </div>
          </div>

          <div className="modal-panel__column modal-panel__column--tags">
            <div className="modal-group modal-group--tight">
              <div className="modal-group__header">
                <strong>{t('metadata.tags')}</strong>
              </div>
              <p className="topbar-filters__hint">{t('metadata.tagsHint')}</p>
              <div className="tag-bubbles">
                {metadataDraft.tags.map((tag, index) => {
                  const isEditing = activeMetadataTagEditorIndex === index;
                  const bubbleLabel = tag.trim() || t('filters.emptyTag');

                  if (isEditing) {
                    return (
                      <div className="tag-bubble tag-bubble--editing" key={`core-tag-${index}`}>
                        <div className="tag-autocomplete">
                          <input
                            type="text"
                            autoFocus
                            value={tag}
                            placeholder={t('metadata.tagPlaceholder')}
                            onFocus={() => onSetActiveTagAutocomplete({ scope: 'metadata', index, highlighted: 0 })}
                            onBlur={() => {
                              window.setTimeout(() => {
                                // Defer blur cleanup so autocomplete mousedown can update the draft first.
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
                                // Match panel editors: Enter/Escape exits inline edit mode.
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
          <button className="button" type="button" onClick={onClose}>{t('common.cancel')}</button>
          <button className="button button--primary" type="button" disabled={isMetadataSaving} onClick={onSave}>
            {isMetadataSaving ? t('actions.saving') : t('metadata.saveMetadata')}
          </button>
        </footer>
      </section>
    </div>
  );
}






