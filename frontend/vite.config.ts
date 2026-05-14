/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@stores': path.resolve(__dirname, './src/stores'),
      '@hooks': path.resolve(__dirname, './src/hooks')
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('html2canvas')) return 'html2canvas';
            if (id.includes('preact') || id.includes('wouter') || id.includes('@preact/signals')) return 'vendor';
          }
        }
      }
    }
  },
  optimizeDeps: {
    include: [
      'react-icons/bi',
    ],
  },
  server: {
    allowedHosts: ['fer-backoffice.menustudioai.com'],
    headers: {
      'Permissions-Policy': 'camera=(self)',
    },
    hmr: {
      host: 'fer-backoffice.menustudioai.com',
      protocol: 'wss',
      clientPort: 443,
      path: '/hmr',
      overlay: false,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:5006',
        changeOrigin: true
      },
      '/hubs': {
        target: 'http://localhost:5006',
        ws: true,
        changeOrigin: true
      }
    }
  },
  test: {
    projects: [{
      extends: true,
      plugins: [
      // The plugin will run tests for the stories defined in your Storybook config
      // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
      storybookTest({
        configDir: path.join(dirname, '.storybook')
      })],
      test: {
        name: 'storybook',
        browser: {
          enabled: true,
          headless: true,
          provider: playwright({}),
          instances: [{
            browser: 'chromium'
          }]
        }
      }
    }, {
      extends: true,
      test: {
        name: 'unit',
        environment: 'jsdom',
        include: [
          'src/**/*.test.{ts,tsx}',
        ],
        setupFiles: ['./tests/vitest.setup.ts'],
        globals: true,
      }
    }, {
      extends: true,
      test: {
        name: 'endpoint',
        environment: 'node',
        include: [
          'tests/endpoints/**/*.test.{ts,tsx}',
        ],
        globals: true,
        testTimeout: 30_000,
        hookTimeout: 30_000,
      }
    }]
  }
});