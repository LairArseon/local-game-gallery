import type { ChangeEvent, DragEvent } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CustomSelect } from './CustomSelect';

type GameArchiveUploadModalProps = {
  isOpen: boolean;
  gameName: string;
  isGameNameLocked: boolean;
  versionName: string;
  tagPool: string[];
  statusChoices: string[];
  isAdvancedOpen: boolean;
  score: string;
  metadataStatus: string;
  description: string;
  notesText: string;
  tagsText: string;
  stagedFileName: string | null;
  isStagingFile: boolean;
  isImporting: boolean;
  uploadProgress: number;
  uploadPhase: 'idle' | 'staging' | 'importing';
  isDragActive: boolean;
  onClose: () => void;
  onSetGameName: (value: string) => void;
  onSetVersionName: (value: string) => void;
  onSetIsAdvancedOpen: (value: boolean) => void;
  onSetScore: (value: string) => void;
  onSetMetadataStatus: (value: string) => void;
  onSetDescription: (value: string) => void;
  onSetNotesText: (value: string) => void;
  onSetTagsText: (value: string) => void;
  onSetIsDragActive: (value: boolean) => void;
  onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRequestPickArchive: () => Promise<boolean>;
  onDropArchive: (event: DragEvent<HTMLElement>) => void;
  onSubmitImport: () => void;
};

export function GameArchiveUploadModal({
  isOpen,
  gameName,
  isGameNameLocked,
  versionName,
  tagPool,
  statusChoices,
  isAdvancedOpen,
  score,
  metadataStatus,
  description,
  notesText,
  tagsText,
  stagedFileName,
  isStagingFile,
  isImporting,
  uploadProgress,
  uploadPhase,
  isDragActive,
  onClose,
  onSetGameName,
  onSetVersionName,
  onSetIsAdvancedOpen,
  onSetScore,
  onSetMetadataStatus,
  onSetDescription,
  onSetNotesText,
  onSetTagsText,
  onSetIsDragActive,
  onFileInputChange,
  onRequestPickArchive,
  onDropArchive,
  onSubmitImport,
}: GameArchiveUploadModalProps) {
  const { t } = useTranslation();
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTagEditorIndex, setActiveTagEditorIndex] = useState<number | null>(null);
  const [activeTagAutocomplete, setActiveTagAutocomplete] = useState<{ index: number; highlighted: number } | null>(null);
  const [tagDraftEntries, setTagDraftEntries] = useState<string[]>([]);

  const noteEntries = useMemo(() => {
    const parsed = notesText.split(/\r?\n/g);
    return parsed.length ? parsed : [''];
  }, [notesText]);

  const activeTagSuggestions = useMemo(() => {
    if (!activeTagAutocomplete) {
      return [] as string[];
    }

    const index = activeTagAutocomplete.index;
    const currentValue = (tagDraftEntries[index] ?? '').trim().toLowerCase();

    const occupied = new Set(
      tagDraftEntries
        .map((entry, entryIndex) => (entryIndex === index ? '' : entry.trim().toLowerCase()))
        .filter(Boolean),
    );

    const ranked = tagPool
      .map((entry) => entry.trim())
      .filter(Boolean)
      .filter((entry) => !occupied.has(entry.toLowerCase()))
      .filter((entry) => (currentValue ? entry.toLowerCase().includes(currentValue) : true))
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));

    return ranked.slice(0, 12);
  }, [activeTagAutocomplete, tagDraftEntries, tagPool]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const parsed = tagsText
      .split(/[\r\n,]+/g)
      .map((entry) => entry.trim())
      .filter(Boolean);
    setTagDraftEntries(parsed);
    setActiveTagEditorIndex(null);
    setActiveTagAutocomplete(null);
  }, [isOpen, tagsText]);

  const writeNotes = (entries: string[]) => {
    onSetNotesText(entries.join('\n'));
  };

  const writeTags = (entries: string[]) => {
    setTagDraftEntries(entries);
    onSetTagsText(entries.map((entry) => entry.trim()).filter(Boolean).join(', '));
  };

  const applyTagSuggestion = (index: number, suggestion: string) => {
    const next = [...tagDraftEntries];
    next[index] = suggestion;
    writeTags(next);
    setActiveTagEditorIndex(null);
    setActiveTagAutocomplete(null);
  };

  const handleTagAutocompleteKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (!activeTagSuggestions.length) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveTagAutocomplete((current) => {
        if (!current || current.index !== index) {
          return { index, highlighted: 0 };
        }

        return {
          index,
          highlighted: (current.highlighted + 1) % activeTagSuggestions.length,
        };
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveTagAutocomplete((current) => {
        if (!current || current.index !== index) {
          return { index, highlighted: Math.max(0, activeTagSuggestions.length - 1) };
        }

        return {
          index,
          highlighted: (current.highlighted - 1 + activeTagSuggestions.length) % activeTagSuggestions.length,
        };
      });
      return;
    }

    if (event.key === 'Enter') {
      const highlighted = activeTagAutocomplete?.index === index ? activeTagAutocomplete.highlighted : 0;
      const suggestion = activeTagSuggestions[highlighted] ?? activeTagSuggestions[0];
      if (!suggestion) {
        return;
      }

      event.preventDefault();
      applyTagSuggestion(index, suggestion);
    }
  };

  if (!isOpen) {
    return null;
  }

  const isUploadProgressVisible = uploadPhase !== 'idle' || uploadProgress > 0;
  const uploadPhaseLabel = uploadPhase === 'importing' ? t('upload.importing') : t('upload.staging');

  const triggerArchivePicker = async () => {
    const handled = await onRequestPickArchive();
    if (!handled) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="modal-backdrop modal-backdrop--upload" onClick={onClose}>
      {isImporting ? (
        <aside className="upload-import-toast" role="status" aria-live="polite">
          <strong>{t('upload.importing')}</strong>
          <p>{t('upload.importStatusHint')}</p>
        </aside>
      ) : null}

      <section className="modal-panel modal-panel--upload" onClick={(event) => event.stopPropagation()}>
        <header className="modal-panel__header">
          <h2>{isGameNameLocked ? t('upload.titleAddVersion') : t('upload.title')}</h2>
          <button className="button" type="button" onClick={onClose}>{t('common.close')}</button>
        </header>

        <div className="modal-panel__body modal-panel__body--upload">
          <div className="upload-modal__top-row">
            <div className="field upload-modal__upload-field">
              <span>{t('upload.archiveLabel')}</span>
              <label
                className={`archive-upload-dropzone ${isDragActive ? 'archive-upload-dropzone--dragover' : ''}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void triggerArchivePicker();
                }}
                onDragEnter={() => onSetIsDragActive(true)}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onSetIsDragActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onSetIsDragActive(false);
                }}
                onDrop={onDropArchive}
                htmlFor={fileInputId}
              >
                <input
                  id={fileInputId}
                  ref={fileInputRef}
                  className="archive-upload-dropzone__input"
                  type="file"
                  accept=".zip,application/zip,application/x-zip-compressed"
                  onChange={onFileInputChange}
                />

                <span className="archive-upload-dropzone__icon" aria-hidden="true">
                  <Upload size={18} />
                </span>
                <span className="archive-upload-dropzone__meta">
                  <p>{t('upload.archiveHint')}</p>
                  {stagedFileName ? (
                    <p className="archive-upload-dropzone__staged">{t('upload.archiveStaged', { name: stagedFileName })}</p>
                  ) : null}
                </span>
                <span className="button button--icon" role="button" aria-hidden="true">{t('upload.chooseFile')}</span>
              </label>
              <div className={`archive-upload-progress ${isUploadProgressVisible ? 'is-visible' : ''}`} aria-hidden={!isUploadProgressVisible}>
                <span className={`archive-upload-progress__bar ${uploadPhase !== 'idle' ? 'is-active' : ''}`} style={{ transform: `scaleX(${uploadProgress})` }} />
                <span className="archive-upload-progress__label">{uploadPhaseLabel}</span>
              </div>
            </div>

            <label className="field upload-modal__version-field">
              <span>{t('upload.versionName')}</span>
              <input
                type="text"
                value={versionName}
                onChange={(event) => onSetVersionName(event.target.value)}
                placeholder={t('upload.versionNamePlaceholder')}
              />
            </label>
          </div>

          <label className="field">
            <span>{t('upload.gameName')}</span>
            <input
              className={isGameNameLocked ? 'upload-modal__game-name--locked' : undefined}
              type="text"
              value={gameName}
              disabled={isGameNameLocked}
              onChange={(event) => onSetGameName(event.target.value)}
              placeholder={t('upload.gameNamePlaceholder')}
            />
          </label>

          {!isGameNameLocked ? (
            <details className="upload-advanced" open={isAdvancedOpen} onToggle={(event) => onSetIsAdvancedOpen((event.currentTarget as HTMLDetailsElement).open)}>
              <summary className="upload-advanced__summary">
                <ChevronDown size={15} aria-hidden="true" />
                <span>{t('upload.advancedTitle')}</span>
              </summary>

              <div className="upload-advanced__body">
                <div className="upload-advanced__layout">
                  <div className="modal-panel__column">
                    <label className="field">
                      <span>{t('upload.score')}</span>
                      <input type="text" value={score} onChange={(event) => onSetScore(event.target.value)} />
                    </label>

                    <label className="field">
                      <span>{t('upload.status')}</span>
                      <CustomSelect
                        ariaLabel={t('upload.statusAria')}
                        value={metadataStatus}
                        options={[
                          { value: '', label: t('detail.notSet') },
                          ...statusChoices.map((entry) => ({ value: entry, label: entry })),
                        ]}
                        onChange={onSetMetadataStatus}
                      />
                    </label>

                    <label className="field">
                      <span>{t('upload.description')}</span>
                      <textarea rows={3} value={description} onChange={(event) => onSetDescription(event.target.value)} />
                    </label>

                    <div className="modal-group">
                      <div className="modal-group__header">
                        <strong>{t('upload.notes')}</strong>
                        <button
                          className="button button--icon"
                          type="button"
                          onClick={() => writeNotes([...noteEntries, ''])}
                        >
                          {t('metadata.addNote')}
                        </button>
                      </div>
                      {noteEntries.map((note, index) => (
                        <div className="tag-row" key={`upload-note-${index}`}>
                          <textarea
                            rows={2}
                            value={note}
                            onChange={(event) => writeNotes(noteEntries.map((entry, noteIndex) => (
                              noteIndex === index ? event.target.value : entry
                            )))}
                          />
                          <button
                            className="button button--icon"
                            type="button"
                            onClick={() => {
                              const next = noteEntries.filter((_, noteIndex) => noteIndex !== index);
                              writeNotes(next.length ? next : ['']);
                            }}
                          >
                            {t('common.remove')}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="modal-panel__column modal-panel__column--tags">
                    <div className="modal-group modal-group--tight">
                      <div className="modal-group__header">
                        <strong>{t('upload.tags')}</strong>
                      </div>
                      <p className="topbar-filters__hint">{t('metadata.tagsHint')}</p>
                      <div className="tag-bubbles">
                        {tagDraftEntries.map((tag, index) => {
                          const isEditing = activeTagEditorIndex === index;
                          const bubbleLabel = tag.trim() || t('filters.emptyTag');

                          if (isEditing) {
                            return (
                              <div className="tag-bubble tag-bubble--editing" key={`upload-tag-${index}`}>
                                <div className="tag-autocomplete">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={tag}
                                    placeholder={t('metadata.tagPlaceholder')}
                                    onFocus={() => setActiveTagAutocomplete({ index, highlighted: 0 })}
                                    onBlur={() => {
                                      window.setTimeout(() => {
                                        const next = [...tagDraftEntries];
                                        next[index] = (next[index] ?? '').trim();
                                        if (!next[index]) {
                                          next.splice(index, 1);
                                        }

                                        writeTags(next);
                                        setActiveTagEditorIndex((current) => (current === index ? null : current));
                                        setActiveTagAutocomplete((current) => {
                                          if (!current || current.index !== index) {
                                            return current;
                                          }

                                          return null;
                                        });
                                      }, 100);
                                    }}
                                    onKeyDown={(event) => {
                                      handleTagAutocompleteKeyDown(event, index);
                                      if (event.key === 'Escape') {
                                        const next = [...tagDraftEntries];
                                        next[index] = (next[index] ?? '').trim();
                                        if (!next[index]) {
                                          next.splice(index, 1);
                                        }

                                        writeTags(next);
                                        setActiveTagEditorIndex(null);
                                        setActiveTagAutocomplete(null);
                                      }
                                    }}
                                    onChange={(event) => {
                                      const next = [...tagDraftEntries];
                                      next[index] = event.target.value;
                                      setTagDraftEntries(next);
                                      setActiveTagAutocomplete({ index, highlighted: 0 });
                                    }}
                                  />
                                  {activeTagAutocomplete?.index === index && activeTagSuggestions.length ? (
                                    <div className="tag-autocomplete__menu">
                                      {activeTagSuggestions.map((suggestion, suggestionIndex) => (
                                        <button
                                          key={`${suggestion}-${suggestionIndex}`}
                                          className={`tag-autocomplete__item ${activeTagAutocomplete.highlighted === suggestionIndex ? 'tag-autocomplete__item--active' : ''}`}
                                          type="button"
                                          onMouseDown={(event) => {
                                            event.preventDefault();
                                            applyTagSuggestion(index, suggestion);
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
                              key={`upload-tag-${index}`}
                              className="tag-bubble"
                              type="button"
                              title={bubbleLabel}
                              onClick={() => setActiveTagEditorIndex(index)}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                writeTags(tagDraftEntries.filter((_, tagIndex) => tagIndex !== index));
                                setActiveTagEditorIndex(null);
                                setActiveTagAutocomplete(null);
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
                            const next = [...tagDraftEntries, ''];
                            setTagDraftEntries(next);
                            setActiveTagEditorIndex(next.length - 1);
                            setActiveTagAutocomplete({ index: next.length - 1, highlighted: 0 });
                          }}
                          title={t('filters.addTagRule')}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </details>
          ) : null}
        </div>

        <footer className="modal-panel__footer">
          <button className="button" type="button" onClick={onClose} disabled={isImporting || isStagingFile}>
            {t('common.cancel')}
          </button>
          <button className="button button--primary" type="button" onClick={onSubmitImport} disabled={isImporting || isStagingFile}>
            {isImporting ? t('upload.importing') : isStagingFile ? t('upload.staging') : t('upload.importButton')}
          </button>
        </footer>
      </section>
    </div>
  );
}
