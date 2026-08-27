import { defineStore } from 'pinia';
import { bindPhone, getMeFull } from '@/api/user';
import { post } from '@/api/request';
import { useAuthStore } from '@/stores/auth';
import { STORAGE_KEYS } from '@/utils/constants';

interface UserState {
  profile: Record<string, unknown> | null;
  loading: boolean;
}

let fullProfilePromise: Promise<Record<string, unknown>> | null = null;

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    profile: null,
    loading: false
  }),
  getters: {
    user: (state) => (state.profile?.user || null) as Record<string, unknown> | null,
    points: (state) => state.profile?.points as Record<string, unknown> | undefined,
    membership: (state) => state.profile?.membership as Record<string, unknown> | undefined,
    pointBalance: (state) => Number((state.profile?.points as Record<string, unknown> | undefined)?.balance || 0),
    isMember: (state) => {
      const membership = state.profile?.membership as Record<string, unknown> | undefined;
      return Boolean(membership?.active || membership?.isMember);
    }
  },
  actions: {
    async hydrate() {
      try {
        const { data } = await uni.getStorage({ key: STORAGE_KEYS.profile });
        this.profile = data && typeof data === 'object' ? data as Record<string, unknown> : null;
      } catch {
        this.profile = null;
      }
    },
    async loadFullProfile() {
      if (fullProfilePromise) return fullProfilePromise;
      this.loading = true;
      fullProfilePromise = (async () => {
        const profile = await getMeFull<Record<string, unknown>>();
        this.profile = profile;
        await setStorageSafe(STORAGE_KEYS.profile, profile);
        return profile;
      })();
      try {
        return await fullProfilePromise;
      } finally {
        fullProfilePromise = null;
        this.loading = false;
      }
    },
    async bindPhoneByCode(code: string, token?: string) {
      const profile = token
        ? await post<Record<string, unknown>>('/users/me/phone', { code }, {
          loading: true,
          header: { Authorization: `Bearer ${token}` }
        })
        : await bindPhone<Record<string, unknown>>(code);
      this.profile = profile;
      await setStorageSafe(STORAGE_KEYS.profile, profile);
      await useAuthStore().markPhoneBoundFromProfile(profile);
      return profile;
    },
    async clear() {
      this.profile = null;
      try {
        await uni.removeStorage({ key: STORAGE_KEYS.profile });
      } catch {
        // 静默失败
      }
    }
  }
});

async function setStorageSafe(key: string, value: unknown): Promise<void> {
  try {
    await uni.setStorage({ key, data: value });
  } catch {
    // 静默失败——状态已在内存中
  }
}
