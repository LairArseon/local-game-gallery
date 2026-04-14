import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const standaloneRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: standaloneRoot,
  base: './',
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: path.resolve(standaloneRoot, '../../dist-standalone-client'),
    emptyOutDir: true,
  },
});
