import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {
  createPackagedModulePlugin,
  createPackagedModuleRollupInput,
  createPackagedModuleRollupOutput,
} from '../../scripts/vite-module-packaging.mjs';

const fullDesktopRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(fullDesktopRoot, '../..');

export default defineConfig({
  root: fullDesktopRoot,
  base: './',
  plugins: [react(), createPackagedModulePlugin({ repoRoot })],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: path.resolve(fullDesktopRoot, '../../dist'),
    emptyOutDir: true,
    rollupOptions: {
      preserveEntrySignatures: 'exports-only',
      input: {
        app: path.resolve(fullDesktopRoot, 'index.html'),
        ...createPackagedModuleRollupInput({ repoRoot }),
      },
      output: createPackagedModuleRollupOutput({ repoRoot }),
    },
  },
});
