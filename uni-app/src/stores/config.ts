import { defineStore } from 'pinia';
import { getAppHome, getPublicApp } from '@/api/config';
import { STORAGE_KEYS } from '@/utils/constants';

interface ConfigState {
  publicConfig: Record<string, unknown>;
  homeData: Record<string, unknown> | null;
  loaded: boolean;
}

export const useConfigStore = defineStore('config', {
  state: (): ConfigState => ({
    publicConfig: {},
    homeData: null,
    loaded: false
  }),
  getters: {
    features: (state) => (state.publicConfig.features || {}) as Record<string, boolean>,
    customerService: (state) => (state.publicConfig.customerService || {}) as Record<string, unknown>,
    appName: (state) => String(state.publicConfig.appName || state.publicConfig.siteName || 'AI创作工坊')
  },
  actions: {
    hydrate() {
      const cached = uni.getStorageSync(STORAGE_KEYS.config);
      this.publicConfig = cached && typeof cached === 'object' ? cached as Record<string, unknown> : {};
    },
    async loadPublicConfig() {
      try {
        const config = await getPublicApp<Record<string, unknown>>();
        this.publicConfig = config;
        this.loaded = true;
        uni.setStorageSync(STORAGE_KEYS.config, config);
        return config;
      } catch (error) {
        this.hydrate();
        throw error;
      }
    },
    async loadHomeData() {
      const data = await getAppHome<Record<string, unknown>>();
      this.homeData = data;
      return data;
    }
  }
});
