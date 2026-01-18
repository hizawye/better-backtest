import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        timeout: 30000,      // 30s timeout
        proxyTimeout: 30000  // 30s proxy timeout
      }
    }
  },
  worker: {
    format: 'es'
  },
  resolve: {
    alias: {
      '$shared': path.resolve(__dirname, '../../shared')
    }
  }
});
