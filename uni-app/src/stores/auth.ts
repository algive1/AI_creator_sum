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
    async hydrate() {
      try {
        const [token, refreshToken, user] = await Promise.all([
          getStorageString(STORAGE_KEYS.token),
          getStorageString(STORAGE_KEYS.refreshToken),
          getStorageObject(STORAGE_KEYS.user),
        ]);
        this.token = token;
        this.refreshToken = refreshToken;
        this.user = user;
      } catch {
        // 存储读取失败时保持空状态
      }
    },
    async applyLogin(payload: LoginResponse) {
      this.token = payload.token;
      this.refreshToken = payload.refreshToken || this.refreshToken;
      this.user = payload.user || null;
      this.expiresIn = payload.expiresIn || '';
      await Promise.all([
        setStorage(STORAGE_KEYS.token, this.token),
        this.refreshToken ? setStorage(STORAGE_KEYS.refreshToken, this.refreshToken) : Promise.resolve(),
        setStorage(STORAGE_KEYS.user, this.user || {}),
      ]);
    },
    async applyTokenRefresh(payload: { token: string; refreshToken?: string; expiresIn?: string }) {
      this.token = payload.token;
      this.refreshToken = payload.refreshToken || this.refreshToken;
      this.expiresIn = payload.expiresIn || this.expiresIn;
      await Promise.all([
        setStorage(STORAGE_KEYS.token, this.token),
        this.refreshToken ? setStorage(STORAGE_KEYS.refreshToken, this.refreshToken) : Promise.resolve(),
      ]);
    },
    async markPhoneBoundFromProfile(profile?: Record<string, unknown> | null) {
      const profileUser = profile && typeof profile === 'object' && profile.user && typeof profile.user === 'object'
        ? profile.user as Record<string, unknown>
        : {};
      const nextUser = {
        ...(this.user || {}),
        ...profileUser,
        phoneBound: true,
      };
      this.user = nextUser;
      await setStorage(STORAGE_KEYS.user, nextUser);
    },
    async loginWithWechat(inviteCode?: string) {
      const payload = await loginByUniCode(inviteCode);
      await this.applyLogin(payload);
      return payload;
    },
    async loginWithWechatTemporary(inviteCode?: string) {
      return loginByUniCode(inviteCode);
    },
    async loginWithDev(inviteCode?: string) {
      const payload = await devLogin(inviteCode);
      await this.applyLogin(payload);
      return payload;
    },
    async loginWithDevTemporary(inviteCode?: string) {
      return devLogin(inviteCode);
    },
    async clearSession() {
      this.token = '';
      this.refreshToken = '';
      this.user = null;
      this.expiresIn = '';
      await Promise.all([
        removeStorage(STORAGE_KEYS.token),
        removeStorage(STORAGE_KEYS.refreshToken),
        removeStorage(STORAGE_KEYS.user),
      ]);
    },
    async logout() {
      await this.clearSession();
      uni.reLaunch({ url: PAGE_ROUTES.home });
    }
  }
});

async function getStorageString(key: string): Promise<string> {
  try {
    const { data } = await uni.getStorage({ key });
    return typeof data === 'string' ? data : '';
  } catch {
    return '';
  }
}

async function getStorageObject(key: string): Promise<Record<string, unknown> | null> {
  try {
    const { data } = await uni.getStorage({ key });
    return data && typeof data === 'object' ? data as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function setStorage(key: string, value: unknown): Promise<void> {
  try {
    await uni.setStorage({ key, data: value });
  } catch {
    // 静默失败——存储写入失败时状态已在内存中
  }
}

async function removeStorage(key: string): Promise<void> {
  try {
    await uni.removeStorage({ key });
  } catch {
    // 静默失败
  }
}
