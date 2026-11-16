import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

const isStandalone = process.env.STANDALONE === 'true';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  plugins: isStandalone ? [viteSingleFile()] : [],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    cors: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  worker: {
    format: 'es',
  },
  build: {
    outDir: isStandalone ? 'portable' : 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 3000,
    ...(isStandalone
      ? {
          assetsInlineLimit: 100_000_000,
          cssCodeSplit: false,
          rollupOptions: {
            output: {
              manualChunks: undefined,
            },
          },
        }
      : {}),
  },
});
