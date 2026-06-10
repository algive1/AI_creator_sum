import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import viteCompression from 'vite-plugin-compression';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:3000';

  return {
    base: '/',
    plugins: [
      react(),
      viteCompression({
        algorithm: 'gzip',
        ext: '.gz',
        threshold: 10240,
        verbose: false,
      }),
    ],
    server: {
      port: 5173,
      proxy: {
        '/api': backendTarget,
        '/static': backendTarget,
      },
    },
    build: {
      emptyOutDir: true,
      minify: 'terser',
      chunkSizeWarningLimit: 1000,
    },
  };
});
