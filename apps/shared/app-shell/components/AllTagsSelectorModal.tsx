import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type TagOption = {
  tag: string;
  count: number;
};

type AllTagsSelectorModalProps = {
  availableTags: TagOption[];
  selectedTags: string[];
  onClose: () => void;
  onAccept: (selectedTags: string[]) => void;
};

export function AllTagsSelectorModal({
  availableTags,
  selectedTags,
  onClose,
  onAccept,
}: AllTagsSelectorModalProps) {
  const { t } = useTranslation();
  const [draftSelection, setDraftSelection] = useState<string[]>(selectedTags);

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
            <p className="topbar-filters__hint">{t('filters.topUsedHint')}</p>
            <div className="tag-bubbles">
              {availableTags.map((entry) => {
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
          </div>
        </div>
        <footer className="modal-panel__footer">
          <button className="button" type="button" onClick={onClose}>{t('common.cancel')}</button>
          <button className="button button--primary" type="button" onClick={() => onAccept(draftSelection)}>
            {t('filters.apply')}
          </button>
        </footer>
      </section>
    </div>
  );
}