import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const fullDesktopRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: fullDesktopRoot,
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: path.resolve(fullDesktopRoot, '../../dist'),
    emptyOutDir: true,
  },
});
