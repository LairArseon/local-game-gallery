/**
 * Provides stable callback bundles for topbar tag-pool and filter panels.
 *
 * This hook converts many inline lambdas into memoized handlers that coordinate
 * autocomplete, editing lifecycle, preset actions, and panel-specific keyboard
 * behavior. It helps keep App and panel components focused on composition while
 * preserving consistent interaction semantics.
 *
 * New to this project: this hook bundles high-churn panel callbacks into stable handlers; trace each returned handler to the underlying manager functions.
 */
import { useCallback, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react';

type TagAutocompleteState = {
  scope: 'pool' | 'filter' | 'metadata';
  index: number;
  highlighted: number;
} | null;

type UseTopbarPanelHandlersArgs = {
  draftTagRules: string[];
  setDraftTagRules: Dispatch<SetStateAction<string[]>>;
  setActiveFilterRuleEditorIndex: Dispatch<SetStateAction<number | null>>;
  setActiveTagAutocomplete: Dispatch<SetStateAction<TagAutocompleteState>>;
  handleTagAutocompleteKeyDown: (
    event: KeyboardEvent<HTMLInputElement>,
    scope: 'pool' | 'filter' | 'metadata',
    index: number,
  ) => void;
  applyTagSuggestion: (scope: 'pool' | 'filter' | 'metadata', index: number, suggestion: string) => void;
  removeTagFromPoolByIndex: (index: number) => Promise<unknown> | void;
  finalizeTagPoolEdit: (index: number) => Promise<unknown> | void;
  startTagPoolEdit: (index: number) => void;
  updateTagPoolEditorValue: (index: number, value: string) => void;
  addTagToPool: () => void;
  setActiveTagPoolEditorIndex: Dispatch<SetStateAction<number | null>>;
  saveCurrentFilterPreset: () => Promise<unknown> | void;
  deleteFilterPreset: (name: string) => Promise<unknown> | void;
  setIsPresetNamingOpen: Dispatch<SetStateAction<boolean>>;
  setDraftPresetName: Dispatch<SetStateAction<string>>;
};

export function useTopbarPanelHandlers({
  draftTagRules,
  setDraftTagRules,
  setActiveFilterRuleEditorIndex,
  setActiveTagAutocomplete,
  handleTagAutocompleteKeyDown,
  applyTagSuggestion,
  removeTagFromPoolByIndex,
  finalizeTagPoolEdit,
  startTagPoolEdit,
  updateTagPoolEditorValue,
  addTagToPool,
  setActiveTagPoolEditorIndex,
  saveCurrentFilterPreset,
  deleteFilterPreset,
  setIsPresetNamingOpen,
  setDraftPresetName,
}: UseTopbarPanelHandlersArgs) {
  const onRemoveTag = useCallback((index: number) => {
    void removeTagFromPoolByIndex(index);
    setActiveTagPoolEditorIndex(null);
    setActiveTagAutocomplete(null);
  }, [removeTagFromPoolByIndex, setActiveTagPoolEditorIndex, setActiveTagAutocomplete]);

  const onFinalizeTagPoolEdit = useCallback((index: number) => {
    void finalizeTagPoolEdit(index);
  }, [finalizeTagPoolEdit]);

  const onTagPoolEditorKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>, index: number) => {
    handleTagAutocompleteKeyDown(event, 'pool', index);
    // Enter/Escape both commit pool edits, matching blur behavior from inline editors.
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      void finalizeTagPoolEdit(index);
    }
  }, [handleTagAutocompleteKeyDown, finalizeTagPoolEdit]);

  const onApplyTagPoolSuggestion = useCallback((index: number, suggestion: string) => {
    applyTagSuggestion('pool', index, suggestion);
  }, [applyTagSuggestion]);

  const onStartEditRule = useCallback((index: number) => {
    setActiveFilterRuleEditorIndex(index);
    setActiveTagAutocomplete({ scope: 'filter', index, highlighted: 0 });
  }, [setActiveFilterRuleEditorIndex, setActiveTagAutocomplete]);

  const onRemoveRule = useCallback((index: number) => {
    setDraftTagRules((current) => current.filter((_, ruleIndex) => ruleIndex !== index));
    setActiveFilterRuleEditorIndex(null);
    setActiveTagAutocomplete(null);
  }, [setDraftTagRules, setActiveFilterRuleEditorIndex, setActiveTagAutocomplete]);

  const onFinalizeRuleBlur = useCallback((index: number) => {
    setDraftTagRules((current) => {
      const nextValue = (current[index] ?? '').trim();
      // Drop empty rule rows on blur so filters remain explicit and deterministic.
      if (nextValue) {
        return current;
      }

      return current.filter((_, ruleIndex) => ruleIndex !== index);
    });
    setActiveFilterRuleEditorIndex((current) => (current === index ? null : current));
    setActiveTagAutocomplete((current) => {
      if (!current || current.scope !== 'filter' || current.index !== index) {
        return current;
      }

      return null;
    });
  }, [setDraftTagRules, setActiveFilterRuleEditorIndex, setActiveTagAutocomplete]);

  const onHandleRuleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>, index: number) => {
    handleTagAutocompleteKeyDown(event, 'filter', index);
    if (event.key === 'Enter' || event.key === 'Escape') {
      setActiveFilterRuleEditorIndex(null);
      setActiveTagAutocomplete(null);
    }
  }, [handleTagAutocompleteKeyDown, setActiveFilterRuleEditorIndex, setActiveTagAutocomplete]);

  const onUpdateRule = useCallback((index: number, value: string) => {
    setDraftTagRules((current) => current.map((entry, ruleIndex) => (ruleIndex === index ? value : entry)));
  }, [setDraftTagRules]);

  const onApplyRuleSuggestion = useCallback((index: number, suggestion: string) => {
    applyTagSuggestion('filter', index, suggestion);
  }, [applyTagSuggestion]);

  const onAddRule = useCallback(() => {
    // Capture next index before enqueueing state so we can immediately focus the new editor.
    const nextIndex = draftTagRules.length;
    setDraftTagRules((current) => [...current, '']);
    setActiveFilterRuleEditorIndex(nextIndex);
    setActiveTagAutocomplete({ scope: 'filter', index: nextIndex, highlighted: 0 });
  }, [draftTagRules.length, setDraftTagRules, setActiveFilterRuleEditorIndex, setActiveTagAutocomplete]);

  const onAddSuggestionTag = useCallback((tag: string) => {
    setDraftTagRules((current) => [...current, tag]);
    setActiveFilterRuleEditorIndex(null);
    setActiveTagAutocomplete(null);
  }, [setDraftTagRules, setActiveFilterRuleEditorIndex, setActiveTagAutocomplete]);

  const onSaveCurrentFilterPreset = useCallback(() => {
    void saveCurrentFilterPreset();
  }, [saveCurrentFilterPreset]);

  const onCancelPresetNaming = useCallback(() => {
    setIsPresetNamingOpen(false);
    setDraftPresetName('');
  }, [setIsPresetNamingOpen, setDraftPresetName]);

  const onDeleteFilterPreset = useCallback((name: string) => {
    void deleteFilterPreset(name);
  }, [deleteFilterPreset]);

  return {
    onRemoveTag,
    onFinalizeTagPoolEdit,
    onTagPoolEditorKeyDown,
    onApplyTagPoolSuggestion,
    onStartEditRule,
    onRemoveRule,
    onFinalizeRuleBlur,
    onHandleRuleKeyDown,
    onUpdateRule,
    onApplyRuleSuggestion,
    onAddRule,
    onAddSuggestionTag,
    onSaveCurrentFilterPreset,
    onCancelPresetNaming,
    onDeleteFilterPreset,
    startTagPoolEdit,
    updateTagPoolEditorValue,
    addTagToPool,
  };
}






