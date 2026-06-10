import { defineStore } from 'pinia';
import { getAppHome, getPublicApp } from '@/api/config';
import { STORAGE_KEYS } from '@/utils/constants';

interface ConfigState {
  publicConfig: Record<string, unknown>;
  homeData: Record<string, unknown> | null;
  loaded: boolean;
}

const PUBLIC_CONFIG_TTL_MS = 60_000;
const HOME_DATA_TTL_MS = 30_000;
let publicConfigPromise: Promise<Record<string, unknown>> | null = null;
let homeDataPromise: Promise<Record<string, unknown>> | null = null;
let publicConfigLoadedAt = 0;
let homeDataLoadedAt = 0;

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
      this.publicConfig = normalizePublicConfig(cached);
    },
    async loadPublicConfig(options: { force?: boolean } = {}) {
      if (!options.force && this.loaded && Date.now() - publicConfigLoadedAt < PUBLIC_CONFIG_TTL_MS) {
        return this.publicConfig;
      }
      if (!options.force && publicConfigPromise) return publicConfigPromise;
      try {
        publicConfigPromise = getPublicApp<Record<string, unknown>>();
        const config = normalizePublicConfig(await publicConfigPromise);
        this.publicConfig = config;
        this.loaded = true;
        publicConfigLoadedAt = Date.now();
        uni.setStorageSync(STORAGE_KEYS.config, config);
        return config;
      } catch (error) {
        this.hydrate();
        throw error;
      } finally {
        publicConfigPromise = null;
      }
    },
    async loadHomeData(options: { force?: boolean } = {}) {
      if (!options.force && this.homeData && Date.now() - homeDataLoadedAt < HOME_DATA_TTL_MS) {
        return this.homeData;
      }
      if (!options.force && homeDataPromise) return homeDataPromise;
      homeDataPromise = getAppHome<Record<string, unknown>>();
      const data = await homeDataPromise.finally(() => {
        homeDataPromise = null;
      });
      this.homeData = data;
      homeDataLoadedAt = Date.now();
      return data;
    }
  }
});

function normalizePublicConfig(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const config = { ...(value as Record<string, unknown>) };
  // Model tiers are large, volatile runtime data. Keep them out of the global
  // cached config store to avoid mp-weixin reactive hydration recursion.
  delete config.modelTiers;
  return config;
}
