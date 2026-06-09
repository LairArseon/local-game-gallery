import { createElement } from 'react';
import type { BuiltInModuleDefinition } from '../shared/app-shell/types/moduleHostTypes';
import moduleManifest from './manifest.json';
import { createDefaultIsolationModuleState, ISOLATION_MODULE_ID } from './core/isolationModule';
import { IsolationMetadataEditorSection } from './ui/IsolationMetadataEditorSection';
import { IsolationSetupSection } from './ui/IsolationSetupSection';

export const isolationModuleDefinition: BuiltInModuleDefinition = {
  id: ISOLATION_MODULE_ID,
  displayName: moduleManifest.displayName,
  description: moduleManifest.description,
  installerComponentId: moduleManifest.installerComponentId,
  enabledByDefault: false,
  contributes: [
    {
      id: 'isolation.setup.section',
      slot: 'setup.section',
      title: 'Isolation Module',
      description: 'Setup and diagnostics surface for optional launch isolation.',
      order: 110,
      render: (context) => createElement(IsolationSetupSection, { context }),
    },
    {
      id: 'isolation.metadata.editor.section',
      slot: 'metadata.editor.section',
      title: 'Isolation Rules',
      description: 'Per-game launch connectivity policy owned by the Isolation module.',
      order: 110,
      render: (context) => createElement(IsolationMetadataEditorSection, { context }),
    },
  ],
  getDefaultState: createDefaultIsolationModuleState,
};

export const moduleEntry = isolationModuleDefinition;

export default isolationModuleDefinition;