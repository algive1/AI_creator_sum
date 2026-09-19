import { updateMe } from '@/api/user';
import { useAuthStore } from '@/stores/auth';

export function hasPhoneAuthorizationPrompted(user: Record<string, unknown> | null | undefined) {
  const preferences = user?.preferences;
  return Boolean(preferences && typeof preferences === 'object'
    && (preferences as Record<string, unknown>).phoneAuthorizationPrompted);
}

export async function recordPhoneAuthorizationPrompted() {
  const authStore = useAuthStore();
  await authStore.markPhoneAuthorizationPrompted();
  await updateMe(
    { preferences: { phoneAuthorizationPrompted: true } },
    { loading: false, silent: true, dedupe: false },
  ).catch(() => undefined);
}
