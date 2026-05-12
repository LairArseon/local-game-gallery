import { f95ModuleDefinition } from '../../../f95-module/module';
import { createBuiltInModuleRegistry } from './moduleRegistry';

const builtInModuleRegistry = createBuiltInModuleRegistry([
  f95ModuleDefinition,
]);

export function getBuiltInModuleRegistry() {
  return builtInModuleRegistry;
}