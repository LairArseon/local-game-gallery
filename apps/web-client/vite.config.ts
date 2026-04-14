import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const webClientRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: webClientRoot,
  base: './',
  plugins: [react()],
  server: {
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: path.resolve(webClientRoot, '../../dist-web-client'),
    emptyOutDir: true,
  },
});
