import { appEnv } from '@/env/index';

export const isDevFallbackEnabled = appEnv.name !== 'production';

export function warnDevFallback(scope: string, reason: string) {
  if (!isDevFallbackEnabled) return;
  console.warn(`[dev-fallback] ${scope}: ${reason}`);
}
