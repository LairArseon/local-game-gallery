/**
 * Topbar panel for maintaining the global tag pool.
 *
 * Users can add, rename, and remove canonical tags while seeing live usage
 * counts from the current library. Editing uses bubble interactions paired with
 * autocomplete so tag normalization is fast and consistent. Removal behavior is
 * intentionally strict to prevent deleting tags still referenced by games.
 *
 * New to this project: this panel manages canonical tags and usage; follow edit/add/remove handlers to useTagPoolManager and autocomplete hooks.
 */
import type { KeyboardEvent } from 'react';
import { TagPoolPanel as SharedTagPoolPanel } from '../../../shared/app-shell/components/TagPoolPanel';

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
    <SharedTagPoolPanel
      tagPool={tagPool}
      tagPoolUsage={tagPoolUsage}
      activeTagPoolEditorIndex={activeTagPoolEditorIndex}
      activeTagAutocomplete={activeTagAutocomplete}
      activeTagSuggestions={activeTagSuggestions}
      onStartEdit={onStartEdit}
      onRemoveTag={onRemoveTag}
      onFinalizeEdit={onFinalizeEdit}
      onEditorValueChange={onEditorValueChange}
      onSetAutocomplete={onSetAutocomplete}
      onEditorKeyDown={onEditorKeyDown}
      onApplySuggestion={onApplySuggestion}
      onAddTag={onAddTag}
    />
  );
}






