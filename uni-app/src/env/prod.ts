const apiBaseURL = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

export const prodEnv = {
  name: 'production',
  baseURL: apiBaseURL,
  timeout: 15000,
  devLoginCode: ''
} as const;
