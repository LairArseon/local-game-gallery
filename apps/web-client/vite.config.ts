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
    rollupOptions: {
      output: {
        manualChunks(id) {
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
        },
      },
    },
  },
});
