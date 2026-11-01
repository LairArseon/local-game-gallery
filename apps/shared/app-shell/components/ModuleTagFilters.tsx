import { useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModuleTagRule } from '../types';
import type { ModuleTagOption, ResolvedModuleFilter } from '../core/moduleFilters';

type ModuleTagFiltersProps = {
  rules: ModuleTagRule[];
  filters: ResolvedModuleFilter[];
  options: ModuleTagOption[];
  onChange: Dispatch<SetStateAction<ModuleTagRule[]>>;
};

export function ModuleTagFilters({ rules, filters, options, onChange }: ModuleTagFiltersProps) {
  const { t } = useTranslation();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  function finish(index: number) {
    onChange((current) => current.filter((rule, ruleIndex) => ruleIndex !== index || rule.tag.trim()));
    setEditingIndex(null);
  }

  return rules.map((rule, index) => {
    const filter = filters.find((entry) => entry.moduleId === rule.moduleId);
    if (!filter) {
      return null;
    }
    const suggestions = options.filter((entry) => entry.moduleId === rule.moduleId
      && entry.tag.toLowerCase().includes(rule.tag.trim().toLowerCase())).slice(0, 8);
    const label = `${rule.exclude ? '-' : ''}${rule.tag}`;
    const className = `tag-bubble ${filter.accentClassName} ${rule.exclude ? 'tag-bubble--exclude' : ''}`;
    if (editingIndex !== index) {
      return (
        <button
          key={`${rule.moduleId}-${index}`}
          className={className}
          type="button"
          title={t('filters.editModuleTag', { module: filter.sourceLabel, tag: label })}
          onClick={() => { setEditingIndex(index); setHighlighted(0); }}
          onContextMenu={(event) => {
            event.preventDefault();
            onChange((current) => current.filter((_, ruleIndex) => ruleIndex !== index));
            setEditingIndex(null);
          }}
        >
          <span className="tag-bubble__source">{filter.sourceLabel}</span> {label}
        </button>
      );
    }

    function applySuggestion(tag: string) {
      onChange((current) => current.map((entry, ruleIndex) => ruleIndex === index ? { ...entry, tag } : entry));
      setEditingIndex(null);
    }

    return (
      <div key={`${rule.moduleId}-${index}`} className={`${className} tag-bubble--editing`}>
        <span className="tag-bubble__source">{filter.sourceLabel}</span>
        <div className="tag-autocomplete">
          <input
            autoFocus
            type="text"
            aria-label={t('filters.editModuleTag', { module: filter.sourceLabel, tag: rule.tag })}
            value={label}
            onChange={(event) => {
              const value = event.target.value;
              const exclude = value.startsWith('-');
              onChange((current) => current.map((entry, ruleIndex) => ruleIndex === index
                ? { ...entry, exclude, tag: exclude ? value.slice(1) : value } : entry));
              setHighlighted(0);
            }}
            onBlur={() => finish(index)}
            onKeyDown={(event) => {
              if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && suggestions.length) {
                event.preventDefault();
                setHighlighted((current) => (current + (event.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length);
              } else if (event.key === 'Enter' || event.key === 'Tab') {
                if (suggestions.length) {
                  event.preventDefault();
                  applySuggestion((suggestions[highlighted] ?? suggestions[0]).tag);
                } else {
                  finish(index);
                }
              } else if (event.key === 'Escape') {
                finish(index);
              }
            }}
          />
          {suggestions.length ? (
            <div className="tag-autocomplete__menu">
              {suggestions.map((entry, suggestionIndex) => (
                <button
                  key={entry.tag}
                  className={`tag-autocomplete__item ${suggestionIndex === highlighted ? 'tag-autocomplete__item--active' : ''}`}
                  type="button"
                  onMouseDown={(event) => { event.preventDefault(); applySuggestion(entry.tag); }}
                >
                  {entry.tag}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  });
}
