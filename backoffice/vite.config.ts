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
      // The @wordpress/* packages restrict their `exports` map and don't
      // expose build-style/*.css under import conditions; alias the CSS we
      // need to the real files so rolldown can bundle them.
      '@wordpress/components/build-style/style.css': path.resolve(
        __dirname,
        './node_modules/@wordpress/components/build-style/style.css',
      ),
      '@wordpress/block-editor/build-style/style.css': path.resolve(
        __dirname,
        './node_modules/@wordpress/block-editor/build-style/style.css',
      ),
      '@wordpress/block-editor/build-style/content.css': path.resolve(
        __dirname,
        './node_modules/@wordpress/block-editor/build-style/content.css',
      ),
      '@wordpress/block-library/build-style/style.css': path.resolve(
        __dirname,
        './node_modules/@wordpress/block-library/build-style/style.css',
      ),
      '@wordpress/block-library/build-style/editor.css': path.resolve(
        __dirname,
        './node_modules/@wordpress/block-library/build-style/editor.css',
      ),
      '@wordpress/format-library/build-style/style.css': path.resolve(
        __dirname,
        './node_modules/@wordpress/format-library/build-style/style.css',
      ),
    },
  },
  server: {
    port: 5173,
    allowedHosts: true,
    headers: {
      'Permissions-Policy': 'camera=(self)',
    },
    proxy: apiProxy,
  },
  preview: {
    port: 5173,
    allowedHosts: true,
    headers: {
      'Permissions-Policy': 'camera=(self)',
    },
    proxy: apiProxy,
  },
});
