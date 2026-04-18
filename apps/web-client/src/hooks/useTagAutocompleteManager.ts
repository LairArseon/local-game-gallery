import { type Dispatch, type SetStateAction } from 'react';
import { useTagAutocompleteManager as useSharedTagAutocompleteManager } from '../../../shared/app-shell/hooks/useTagAutocompleteManager';
import type { GalleryConfig, GameMetadata } from '../types';

type TagScope = 'pool' | 'filter' | 'metadata';

type TagAutocompleteState = {
  scope: TagScope;
  index: number;
  highlighted: number;
} | null;

type UseTagAutocompleteManagerArgs = {
  config: GalleryConfig | null;
  draftTagRules: string[];
  metadataDraft: GameMetadata | null;
  activeTagAutocomplete: TagAutocompleteState;
  setActiveTagAutocomplete: Dispatch<SetStateAction<TagAutocompleteState>>;
  setConfig: Dispatch<SetStateAction<GalleryConfig | null>>;
  setDraftTagRules: Dispatch<SetStateAction<string[]>>;
  setMetadataDraft: Dispatch<SetStateAction<GameMetadata | null>>;
  persistTagPool: (nextPool: string[]) => Promise<unknown> | void;
};

export function useTagAutocompleteManager(args: UseTagAutocompleteManagerArgs) {
  return useSharedTagAutocompleteManager<GalleryConfig, GameMetadata>(args);
}
