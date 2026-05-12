import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {
  createPackagedModulePlugin,
  createPackagedModuleRollupInput,
  createPackagedModuleRollupOutput,
} from '../../scripts/vite-module-packaging.mjs';

const standaloneRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(standaloneRoot, '../..');

function createManualChunks(id) {
  if (!id.includes('node_modules')) {
    return undefined;
  }

  if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
    return 'react-vendor';
  }

  if (id.includes('/i18next/') || id.includes('/react-i18next/')) {
    return 'i18n-vendor';
  }

  if (id.includes('/lucide-react/')) {
    return 'icons-vendor';
  }

  return 'vendor';
}

export default defineConfig({
  root: standaloneRoot,
  base: './',
  plugins: [react(), createPackagedModulePlugin({ repoRoot })],
  server: {
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: path.resolve(standaloneRoot, '../../dist-standalone-client'),
    emptyOutDir: true,
    rollupOptions: {
      preserveEntrySignatures: 'exports-only',
      input: {
        app: path.resolve(standaloneRoot, 'index.html'),
        ...createPackagedModuleRollupInput({ repoRoot }),
      },
      output: createPackagedModuleRollupOutput({ repoRoot, manualChunks: createManualChunks }),
    },
  },
});
