import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const apiProxy = {
  '/api': {
    target: 'http://localhost:5006',
    changeOrigin: true,
  },
  '/hubs': {
    target: 'http://localhost:5006',
    ws: true,
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@stores': path.resolve(__dirname, './src/stores'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
    },
  },
  server: {
    port: 5173,
    allowedHosts: ['backoffice.fercup.com', 'localhost'],
    headers: {
      'Permissions-Policy': 'camera=(self)',
    },
    proxy: apiProxy,
  },
  preview: {
    port: 5173,
    allowedHosts: ['backoffice.fercup.com', 'localhost'],
    headers: {
      'Permissions-Policy': 'camera=(self)',
    },
    proxy: apiProxy,
  },
});
