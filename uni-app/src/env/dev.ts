export const devEnv = {
  name: 'development',
  baseURL: String(import.meta.env.VITE_API_BASE_URL || 'https://mini.thtapi.com/api/v1').trim().replace(/\/+$/, ''),
  timeout: 60000,
  devLoginCode: 'dev_uni_app_user'
} as const;

export type AppEnv = typeof devEnv;
