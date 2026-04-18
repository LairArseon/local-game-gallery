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
import type { GameMetadata } from '../types';
import { MetadataModal as SharedMetadataModal } from '../../../shared/app-shell/components/MetadataModal';

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
    <SharedMetadataModal<GameMetadata>
      metadataDraft={metadataDraft}
      statusChoices={statusChoices}
      activeMetadataTagEditorIndex={activeMetadataTagEditorIndex}
      activeTagAutocomplete={activeTagAutocomplete}
      activeTagSuggestions={activeTagSuggestions}
      isMetadataSaving={isMetadataSaving}
      onClose={onClose}
      onSave={onSave}
      onSetMetadataDraft={onSetMetadataDraft}
      onSetActiveMetadataTagEditorIndex={onSetActiveMetadataTagEditorIndex}
      onSetActiveTagAutocomplete={onSetActiveTagAutocomplete}
      onHandleTagAutocompleteKeyDown={onHandleTagAutocompleteKeyDown}
      onApplyTagSuggestion={onApplyTagSuggestion}
    />
  );
}






