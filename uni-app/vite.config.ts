import { defineConfig } from 'vite';
import { loadEnv } from 'vite';
import uniPluginModule from '@dcloudio/vite-plugin-uni';

const uniPlugin =
  typeof uniPluginModule === 'function'
    ? uniPluginModule
    : (uniPluginModule as unknown as { default: typeof uniPluginModule }).default;

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (command === 'build' && !String(env.VITE_API_BASE_URL || '').trim()) {
    throw new Error('VITE_API_BASE_URL is required for production builds');
  }

  return {
    plugins: [uniPlugin()],
    resolve: {
      alias: {
        '@': '/src'
      }
    }
  };
});
