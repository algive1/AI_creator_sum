import { defineStore } from 'pinia';
import { devLogin, loginByUniCode, type LoginResponse } from '@/api/auth';
import { PAGE_ROUTES, STORAGE_KEYS } from '@/utils/constants';

interface AuthState {
  token: string;
  refreshToken: string;
  user: Record<string, unknown> | null;
  expiresIn: string;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: '',
    refreshToken: '',
    user: null,
    expiresIn: ''
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.token)
  },
  actions: {
    hydrate() {
      this.token = String(uni.getStorageSync(STORAGE_KEYS.token) || '');
      this.refreshToken = String(uni.getStorageSync(STORAGE_KEYS.refreshToken) || '');
      const user = uni.getStorageSync(STORAGE_KEYS.user);
      this.user = user && typeof user === 'object' ? user as Record<string, unknown> : null;
    },
    applyLogin(payload: LoginResponse) {
      this.token = payload.token;
      this.refreshToken = payload.refreshToken || this.refreshToken;
      this.user = payload.user || null;
      this.expiresIn = payload.expiresIn || '';
      uni.setStorageSync(STORAGE_KEYS.token, this.token);
      if (this.refreshToken) uni.setStorageSync(STORAGE_KEYS.refreshToken, this.refreshToken);
      uni.setStorageSync(STORAGE_KEYS.user, this.user || {});
    },
    applyTokenRefresh(payload: { token: string; refreshToken?: string; expiresIn?: string }) {
      this.token = payload.token;
      this.refreshToken = payload.refreshToken || this.refreshToken;
      this.expiresIn = payload.expiresIn || this.expiresIn;
      uni.setStorageSync(STORAGE_KEYS.token, this.token);
      if (this.refreshToken) uni.setStorageSync(STORAGE_KEYS.refreshToken, this.refreshToken);
    },
    async loginWithWechat(inviteCode?: string) {
      const payload = await loginByUniCode(inviteCode);
      this.applyLogin(payload);
      return payload;
    },
    async loginWithDev(inviteCode?: string) {
      const payload = await devLogin(inviteCode);
      this.applyLogin(payload);
      return payload;
    },
    clearSession() {
      this.token = '';
      this.refreshToken = '';
      this.user = null;
      this.expiresIn = '';
      uni.removeStorageSync(STORAGE_KEYS.token);
      uni.removeStorageSync(STORAGE_KEYS.refreshToken);
      uni.removeStorageSync(STORAGE_KEYS.user);
    },
    logout() {
      this.clearSession();
      uni.reLaunch({ url: PAGE_ROUTES.home });
    }
  }
});
