export const devEnv = {
  name: 'development',
  baseURL: 'http://127.0.0.1:3000/api/v1',
  timeout: 15000,
  devLoginCode: 'dev_uni_app_user'
} as const;

export type AppEnv = typeof devEnv;
