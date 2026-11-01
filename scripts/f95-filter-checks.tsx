import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import i18next from 'i18next';
import { I18nextProvider, useTranslation } from 'react-i18next';
import en from '../apps/full-desktop/src/i18n/en/common.json';
import es from '../apps/full-desktop/src/i18n/es/common.json';
import { f95ModuleDefinition } from '../apps/f95-module/module';
import { F95_STARS_RATING_TAG, F95_THREAD_TAGS_TAG } from '../apps/f95-module/core/f95Tags';
import { resolveConfiguredModules } from '../apps/shared/app-shell/core/moduleRegistry';
import { addModuleTagRules, buildModuleTagPool, compareModuleScores, moduleTagKey, resolveModuleFilters } from '../apps/shared/app-shell/core/moduleFilters';
import { useFilterManagerCore } from '../apps/shared/app-shell/hooks/useFilterManagerCore';
import { useTagAutocompleteManager } from '../apps/shared/app-shell/hooks/useTagAutocompleteManager';
import { useTopbarPanelHandlers } from '../apps/shared/app-shell/hooks/useTopbarPanelHandlers';
import { normalizeTagRules } from '../apps/shared/app-shell/utils/app-helpers';
import { FilterPanel } from '../apps/shared/app-shell/components/FilterPanel';
import { AllTagsSelectorModal } from '../apps/shared/app-shell/components/AllTagsSelectorModal';
import { useAppUiLabels } from '../apps/shared/app-shell/hooks/useAppUiLabels';
import type { FilterOrderByMode, FilterPreset, ModuleTagRule } from '../apps/shared/app-shell/types';
import type { GameSummaryLike, TagAutocompleteState } from '../apps/shared/app-shell/types/filterManagerTypes';
import type { ModuleHostGameLike } from '../apps/shared/app-shell/types/moduleHostTypes';

type TestGame = GameSummaryLike & ModuleHostGameLike & { isVaulted?: boolean };
type TestConfig = {
  statusChoices: string[];
  tagPool: string[];
  tagPoolUsage: Record<string, number>;
  filterPresets: FilterPreset[];
};

export async function runF95FilterChecks() {
  let checkCount = 0;
  function check(value: unknown, message: string) {
    if (!value) throw new Error(`F95 filters: ${message}`);
    checkCount += 1;
  }
  function game(path: string, name: string, tags: string[], threadTags: string, rating: string, isVaulted = false): TestGame {
    return {
      path, name, isVaulted, versions: [{ name: 'v1' }],
      metadata: {
        tags, score: '8', status: 'Playing',
        customTags: [
          { key: F95_THREAD_TAGS_TAG, value: threadTags },
          { key: F95_STARS_RATING_TAG, value: rating },
        ],
      },
    };
  }
  const games = [
    game('a', 'Alpha', ['Same'], 'Other', ''),
    game('b', 'Bravo', ['Other'], 'SAME\nsame\n adventure ', '4.62'),
    game('c', 'Charlie', ['same'], 'same', '4.61'),
    game('d', 'Delta', [], 'same', '0'),
    game('e', 'Echo', [], '', 'unknown'),
    game('f', 'Foxtrot', [], 'same', '4.61'),
    game('z', 'Zulu', [], 'Secret', '5', true),
  ];
  const moduleState = { f95: { installed: true, enabled: true, state: {} } };
  const activeFilters = resolveModuleFilters(resolveConfiguredModules([f95ModuleDefinition], moduleState), games);
  const pool = buildModuleTagPool(activeFilters, games, false);
  check(pool.find((entry) => entry.tag.toLowerCase() === 'same')?.count === 4, 'count each game once per case-insensitive tag');
  check(!pool.some((entry) => entry.tag === 'Secret'), 'locked vault does not expose tag names');
  check(buildModuleTagPool(activeFilters, games, true).some((entry) => entry.tag === 'Secret'), 'unlocked vault exposes its tags');
  check(resolveModuleFilters([], games).length === 0, 'missing package has no filter contribution');
  for (const state of [
    { installed: true, enabled: false, state: {} },
    { installed: false, enabled: true, state: {} },
  ]) {
    check(resolveModuleFilters(resolveConfiguredModules([f95ModuleDefinition], { f95: state }), games).length === 0, 'disabled/uninstalled module has no filters');
  }
  check(compareModuleScores(null, 0, true) > 0 && compareModuleScores(null, 0, false) > 0, 'null comes last even against zero');
  check(compareModuleScores(Number.NaN, 5, false) > 0, 'invalid numeric scores come last');
  const sameOption = pool.find((entry) => entry.tag.toLowerCase() === 'same');
  check(sameOption, 'same tag available');
  const sameRule: ModuleTagRule = { moduleId: 'f95', tag: 'same', exclude: false };
  check(addModuleTagRules([sameRule], [{ ...sameRule, tag: ' SAME ' }]).length === 1, 'module rule additions deduplicate by source');

  const i18n = i18next.createInstance();
  await i18n.init({ lng: 'en', fallbackLng: 'en', defaultNS: 'common', resources: { en: { common: en }, es: { common: es } } });
  const t = (key: string, options?: Record<string, unknown>) => String(i18n.t(key, options));
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const render = async (content: React.ReactNode) => {
    await act(async () => root.render(<I18nextProvider i18n={i18n}>{content}</I18nextProvider>));
  };
  const click = async (element: Element | null) => {
    if (!(element instanceof HTMLElement)) throw new Error('F95 filters: click target missing');
    await act(async () => element.click());
  };
  const input = async (element: HTMLInputElement | null, value: string) => {
    if (!element) throw new Error('F95 filters: input missing');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  try {
    let acceptedNormal: string[] = [];
    let acceptedModule: string[] = [];
    await render(<AllTagsSelectorModal
      availableTags={[{ tag: 'same', count: 2 }, { tag: 'local', count: 1 }]}
      selectedTags={[]}
      availableModuleTags={pool}
      onAcceptModuleTags={(tags) => { acceptedModule = tags.map(moduleTagKey); }}
      onAccept={(tags) => { acceptedNormal = tags; }}
      onClose={() => {}}
    />);
    check([...container.querySelectorAll('h3')].map((element) => element.textContent).join('|') === 'Normal tags|F95 tags', 'picker separates pools');
    const sameButtons = [...container.querySelectorAll<HTMLButtonElement>('.tag-bubble')]
      .filter((element) => element.querySelector('span')?.textContent?.toLowerCase() === 'same');
    check(sameButtons.length === 2, 'duplicate names appear in separate pools');
    check(getComputedStyle(sameButtons[1]).borderColor === 'rgba(255, 170, 129, 0.42)', 'F95 tags use existing module accent');
    check(getComputedStyle(sameButtons[0]).borderColor !== getComputedStyle(sameButtons[1]).borderColor, 'normal and F95 colors are distinct');
    await click(sameButtons[1]);
    check(sameButtons[1].getAttribute('aria-pressed') === 'true' && sameButtons[0].getAttribute('aria-pressed') === 'false', 'selection identity includes source');
    check(getComputedStyle(sameButtons[1]).borderColor === 'rgba(255, 170, 129, 0.88)', 'selected F95 tag keeps its accent');
    await input(container.querySelector('input[type=search]'), 'sAmE');
    check(container.querySelectorAll('.tag-bubble').length === 2, 'picker searches both sources case-insensitively');
    await click([...container.querySelectorAll('button')].find((element) => element.textContent === 'Apply') ?? null);
    check(acceptedNormal.length === 0 && acceptedModule.includes(moduleTagKey(sameRule)), 'picker accepts source-specific selection');
    await render(<AllTagsSelectorModal availableTags={[{ tag: 'same', count: 2 }]} selectedTags={[]} onAccept={() => {}} onClose={() => {}} />);
    check(!container.querySelector('.tag-bubble--f95'), 'metadata picker remains normal-only');

    let currentFilters = activeFilters;
    let query = '';
    let showPanel = false;
    const persistence: { config: TestConfig | null } = { config: null };
    const initialConfig: TestConfig = { statusChoices: ['Playing'], tagPool: ['Same', 'Other'], tagPoolUsage: { Same: 2, Other: 1 }, filterPresets: [] };
    const normalizedScore = (value: unknown) => Number.parseFloat(String(value)) || 0;
    let model!: ReturnType<typeof useFilterManagerCore<FilterOrderByMode, FilterPreset, TestConfig, TestGame>>;
    let autocomplete!: ReturnType<typeof useTagAutocompleteManager<TestConfig, { tags: string[] }>>;
    function Hook() {
      const [config, setConfig] = useState<TestConfig | null>(initialConfig);
      const [, setStatus] = useState('');
      const [activeTagAutocomplete, setActiveTagAutocomplete] = useState<TagAutocompleteState>(null);
      const [metadataDraft, setMetadataDraft] = useState<{ tags: string[] } | null>(null);
      const [, setPoolIndex] = useState<number | null>(null);
      model = useFilterManagerCore({
        config, setConfig, games, moduleFilters: currentFilters, searchQuery: query,
        setStatus, setActiveTagAutocomplete, t, normalizeTagRules, normalizedScore,
        logAppEvent: async (message) => { throw new Error(message); },
        toErrorMessage: String, isSizeOrderingEnabled: true,
        saveConfig: async (next) => { persistence.config = JSON.parse(JSON.stringify(next)); return next; },
      });
      autocomplete = useTagAutocompleteManager({
        config, setConfig, draftTagRules: model.draftTagRules, setDraftTagRules: model.setDraftTagRules,
        metadataDraft, setMetadataDraft, activeTagAutocomplete, setActiveTagAutocomplete,
        persistTagPool: () => {},
      });
      const handlers = useTopbarPanelHandlers({
        draftTagRules: model.draftTagRules, setDraftTagRules: model.setDraftTagRules,
        setActiveFilterRuleEditorIndex: model.setActiveFilterRuleEditorIndex, setActiveTagAutocomplete,
        ...autocomplete, removeTagFromPoolByIndex: () => {}, finalizeTagPoolEdit: () => {},
        startTagPoolEdit: () => {}, updateTagPoolEditorValue: () => {}, addTagToPool: () => {},
        setActiveTagPoolEditorIndex: setPoolIndex, saveCurrentFilterPreset: model.saveCurrentFilterPreset,
        renameFilterPreset: model.renameFilterPreset, deleteFilterPreset: model.deleteFilterPreset,
        setIsPresetNamingOpen: model.setIsPresetNamingOpen, setDraftPresetName: model.setDraftPresetName,
      });
      const { t: translate } = useTranslation();
      const { orderByModeLabels } = useAppUiLabels(translate);
      return showPanel ? <FilterPanel
        {...model}
        {...handlers}
        activeTagAutocomplete={activeTagAutocomplete}
        activeTagSuggestions={autocomplete.activeTagSuggestions}
        onSetActiveTagAutocomplete={setActiveTagAutocomplete}
        moduleFilters={currentFilters}
        moduleTagOptions={buildModuleTagPool(currentFilters, games, false)}
        onChangeModuleTagRules={model.setDraftModuleTagRules}
        allTagSuggestions={[]}
        orderByModeLabels={orderByModeLabels}
        isSizeOrderingEnabled
        statusChoices={initialConfig.statusChoices}
        filterPresets={config?.filterPresets ?? []}
        onOpenAllTagsSelector={() => {}}
        onChangeDraftMinScore={model.setDraftMinScore}
        onChangeDraftOrderBy={model.setDraftOrderBy}
        onChangeDraftStatus={model.setDraftStatus}
        onBeginSavePreset={model.beginSavePreset}
        onChangeDraftPresetName={model.setDraftPresetName}
        onLoadFilterPreset={model.loadFilterPresetToDraft}
        onResetStagedFilters={model.resetStagedFilters}
      /> : null;
    }
    const renderHook = () => render(<Hook />);
    const names = () => model.filteredGames.map((entry) => entry.path).join(',');
    await renderHook();
    await act(async () => model.setDraftOrderBy('f95-score-asc'));
    check(names() === 'd,c,f,b,z,a,e', 'ascending rating preserves precision, zero, ties, missing-last');
    await act(async () => model.setDraftOrderBy('f95-score-desc'));
    check(names() === 'z,b,c,f,d,a,e', 'descending rating preserves precision, zero, ties, missing-last');
    await act(async () => { model.resetStagedFilters(); model.setDraftTagRules(['SaMe']); });
    check(names() === 'a,c', 'normal tag matches only normal source');
    await act(async () => { model.setDraftTagRules([]); model.setDraftModuleTagRules([sameRule]); });
    check(names() === 'b,c,d,f', 'F95 tag matches only F95 source');
    await act(async () => model.setDraftTagRules(['same']));
    check(names() === 'c', 'AND semantics across sources');
    await act(async () => model.setDraftModuleTagRules([{ ...sameRule, exclude: true }]));
    check(names() === 'a', 'F95 exclusion remains source-specific');
    await act(async () => model.resetStagedFilters());
    query = 'ADVENTURE';
    await renderHook();
    check(names() === 'b', 'game search includes F95 tags');
    currentFilters = [];
    await renderHook();
    check(names() === '', 'inactive module tags do not participate in search');
    query = 'v1';
    await renderHook();
    check(model.filteredGames.length === games.length, 'version search unchanged');
    query = '';
    currentFilters = activeFilters;
    await renderHook();
    await act(async () => {
      model.setDraftModuleTagRules([sameRule]);
      model.setDraftOrderBy('f95-score-desc');
      model.setDraftPresetName('F95 preset');
    });
    await act(async () => { await model.saveCurrentFilterPreset(); });
    const preset = persistence.config?.filterPresets[0];
    if (!preset) throw new Error('F95 filters: preset was not persisted');
    check(preset.moduleTagRules?.[0].moduleId === 'f95' && preset.orderBy === 'f95-score-desc', 'save preset preserves source and order');
    currentFilters = [];
    await renderHook();
    check(model.hasSuspendedModuleFilters && names() === 'a,b,c,d,e,f,z', 'unavailable module suspends tag rules and uses alphabetical order');
    check(model.draftModuleTagRules.length === 1 && model.draftOrderBy === 'f95-score-desc', 'suspension retains current state');
    await act(async () => model.loadFilterPresetToDraft(preset));
    check(model.hasSuspendedModuleFilters, 'F95 preset remains suspended when absent');
    currentFilters = activeFilters;
    await renderHook();
    check(!model.hasSuspendedModuleFilters && names() === 'b,c,f,d', 'reenabling restores score order and rules');
    await act(async () => model.loadFilterPresetToDraft({ name: 'Legacy', tagRules: ['same'], orderBy: 'alpha-asc', minScore: '', status: [] }));
    check(model.draftModuleTagRules.length === 0 && names() === 'a,c', 'legacy preset stays normal-only');
    await act(async () => model.resetStagedFilters());
    showPanel = true;
    await renderHook();
    await click(container.querySelector('[aria-label="Order by"]'));
    check(container.textContent?.includes('F95 Score Up') && container.textContent.includes('F95 Score Down'), 'active sort menu exposes exact labels');
    await click([...container.querySelectorAll('button')].find((element) => element.textContent?.trim() === 'F95 Score Down') ?? null);
    check(model.draftOrderBy === 'f95-score-desc', 'sort menu changes actual projection');
    const suggestion = [...container.querySelectorAll<HTMLButtonElement>('.tag-bubble--suggested.tag-bubble--f95')]
      .find((element) => element.textContent?.toLowerCase().includes('same'));
    await click(suggestion ?? null);
    check(names() === 'b,c,f,d', 'F95 suggestion adds real filter');
    await click(container.querySelector('.tag-bubbles > button.tag-bubble--f95:not(.tag-bubble--suggested)'));
    const moduleInput = container.querySelector<HTMLInputElement>('.tag-bubble--f95 input');
    await input(moduleInput, '-same');
    await act(async () => moduleInput!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    check(model.draftModuleTagRules[0].exclude && names() === 'z,a,e', 'module bubble editing supports exclusion');
    await act(async () => container.querySelector('.tag-bubbles > button.tag-bubble--f95:not(.tag-bubble--suggested)')!
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
    check(model.draftModuleTagRules.length === 0, 'right click removes module rule');
    await click(container.querySelector('.tag-bubble--add'));
    await input(container.querySelector('.tag-bubble--editing input'), '-adventure');
    const moduleAutocomplete = container.querySelector('.tag-autocomplete__item.tag-bubble--f95');
    check(moduleAutocomplete?.textContent?.includes('F95') && moduleAutocomplete.textContent.includes('adventure'), 'filter autocomplete includes labeled F95 suggestions');
    await act(async () => container.querySelector('.tag-bubble--editing input')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    check(model.draftTagRules.length === 0 && model.draftModuleTagRules[0].tag === 'adventure' && model.draftModuleTagRules[0].exclude, 'keyboard selects F95 source preserving exclusion');
    check(!autocomplete.activeTagSuggestions.includes('adventure'), 'normal pool autocomplete stays unpolluted');
    currentFilters = [];
    await renderHook();
    check(container.querySelector('[role=status]')?.textContent?.includes('inactive'), 'suspended filters display a notice');
    check(!container.querySelector('.tag-bubble--f95'), 'inactive module hides tag controls');
    await click(container.querySelector('[aria-label="Order by"]'));
    check(!container.textContent?.includes('F95 Score Up') && !container.textContent?.includes('F95 Score Down'), 'inactive module hides score options');
    currentFilters = activeFilters;
    await renderHook();
    await act(async () => i18n.changeLanguage('es'));
    check(container.textContent?.includes('Puntuación F95 ascendente'), 'Spanish sort localization');
    const changedGames = games.map((entry) => entry.path === 'b' ? game('b', 'Bravo', ['Other'], 'New tag', '4.62') : entry);
    const changedPool = buildModuleTagPool(resolveModuleFilters(resolveConfiguredModules([f95ModuleDefinition], moduleState), changedGames), changedGames, false);
    check(changedPool.some((entry) => entry.tag === 'New tag') && !changedPool.some((entry) => entry.tag === 'adventure'), 'pool updates from refreshed metadata');
    return { checks: checkCount };
  } finally {
    await act(async () => root.unmount());
    container.remove();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
  }
}
