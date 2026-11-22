import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const browserCoreAlias = {
  '@dash/browser-core': path.resolve(__dirname, '../../packages/browser-core/src/index.ts'),
};

const appVersion = (JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as { version: string }).version;

export default defineConfig({
  // Shown in Settings → About; comes straight from package.json at build time.
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  resolve: {
    alias: browserCoreAlias,
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'src/main/index.ts',
        vite: {
          resolve: { alias: browserCoreAlias },
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: ['electron', 'better-sqlite3', 'electron-updater'],
            },
          },
        },
      },
      preload: {
        input: 'src/preload/index.ts',
        vite: {
          resolve: { alias: browserCoreAlias },
          build: {
            outDir: 'dist-electron/preload',
            rollupOptions: {
              output: {
                format: 'cjs',
                entryFileNames: 'index.js',
              },
            },
          },
        },
      },
    }),
  ],
  root: '.',
  build: {
    outDir: 'dist-electron/renderer',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        internal: path.resolve(__dirname, 'internal.html'),
      },
    },
  },
});
