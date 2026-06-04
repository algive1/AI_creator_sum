import { defineStore } from 'pinia';
import { getMeFull } from '@/api/user';
import { STORAGE_KEYS } from '@/utils/constants';

interface UserState {
  profile: Record<string, unknown> | null;
  loading: boolean;
}

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
    hydrate() {
      const profile = uni.getStorageSync(STORAGE_KEYS.profile);
      this.profile = profile && typeof profile === 'object' ? profile as Record<string, unknown> : null;
    },
    async loadFullProfile() {
      this.loading = true;
      try {
        const profile = await getMeFull<Record<string, unknown>>();
        this.profile = profile;
        uni.setStorageSync(STORAGE_KEYS.profile, profile);
        return profile;
      } finally {
        this.loading = false;
      }
    },
    clear() {
      this.profile = null;
      uni.removeStorageSync(STORAGE_KEYS.profile);
    }
  }
});
