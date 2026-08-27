import type { LoginResponse } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import { useUserStore } from '@/stores/user';
import { showAppDialog } from '@/utils/app-dialog';
import { isDevFallbackEnabled } from '@/utils/dev-fallback';

interface LoginGuardOptions {
  title?: string;
  subtitle?: string;
  inviteCode?: string;
}

let loginPromise: Promise<boolean> | null = null;

export async function ensureLoggedIn(options: LoginGuardOptions = {}): Promise<boolean> {
  const authStore = useAuthStore();
  await authStore.hydrate();
  if (authStore.isLoggedIn) return ensurePhoneBound(options);
  if (loginPromise) return loginPromise;

  loginPromise = runLoginFlow(options);
  try {
    return await loginPromise;
  } finally {
    loginPromise = null;
  }
}

async function runLoginFlow(options: LoginGuardOptions): Promise<boolean> {
  const authStore = useAuthStore();
  const userStore = useUserStore();
  let pendingLogin: LoginResponse | null = null;

  const loginResult = await showAppDialog({
    variant: 'generic',
    hideVisual: true,
    title: options.title || '登录后继续使用',
    subtitle: options.subtitle || '登录后可同步积分、会员、作品库和生成任务。',
    primaryLabel: '微信登录',
    secondaryLabel: '暂不登录',
    minorLabel: isDevFallbackEnabled ? '开发登录' : undefined,
    onPrimary: async () => {
      try {
        pendingLogin = await authStore.loginWithWechatTemporary(options.inviteCode);
        return true;
      } catch (error) {
        uni.showToast({ title: loginErrorText(error), icon: 'none' });
        return false;
      }
    },
    onMinor: async () => {
      if (!isDevFallbackEnabled) return true;
      try {
        pendingLogin = await authStore.loginWithDevTemporary(options.inviteCode);
        return true;
      } catch (error) {
        uni.showToast({ title: loginErrorText(error), icon: 'none' });
        return false;
      }
    }
  });
  if (!pendingLogin || (loginResult !== 'primary' && loginResult !== 'minor')) return false;

  let completed = false;
  await showAppDialog({
    variant: 'phone',
    hideVisual: true,
    title: '完成登录验证',
    subtitle: '请授权手机号完成登录。未授权时不会保存登录状态。',
    primaryLabel: '授权手机号并登录',
    secondaryLabel: '取消登录',
    primaryOpenType: 'getPhoneNumber',
    maskClosable: false,
    onGetPhoneNumber: async (event: unknown) => {
      if (!pendingLogin) return false;
      const phoneCode = phoneCodeFromEvent(event);
      if (!phoneCode) {
        uni.showToast({ title: '未获得手机号授权', icon: 'none' });
        return false;
      }
      try {
        const profile = await userStore.bindPhoneByCode(phoneCode, pendingLogin.token);
        await authStore.applyLogin(pendingLogin);
        await authStore.markPhoneBoundFromProfile(profile);
        completed = true;
        uni.showToast({ title: '登录成功', icon: 'none' });
        return true;
      } catch (error) {
        uni.showToast({ title: loginErrorText(error, '手机号授权失败'), icon: 'none' });
        return false;
      }
    },
    onSecondary: () => {
      pendingLogin = null;
    }
  });

  return completed && authStore.isLoggedIn;
}

async function ensurePhoneBound(options: LoginGuardOptions): Promise<boolean> {
  const userStore = useUserStore();
  await userStore.hydrate();
  if (isPhoneBound(userStore.user)) return true;

  await userStore.loadFullProfile().catch(() => undefined);
  if (isPhoneBound(userStore.user)) return true;
  if (!useAuthStore().isLoggedIn) return false;

  let completed = false;
  await showAppDialog({
    variant: 'phone',
    hideVisual: true,
    title: options.title || '完成登录验证',
    subtitle: '请授权手机号后继续。未授权时不能使用账号相关功能。',
    primaryLabel: '授权手机号并继续',
    secondaryLabel: '暂不继续',
    primaryOpenType: 'getPhoneNumber',
    maskClosable: false,
    onGetPhoneNumber: async (event: unknown) => {
      const phoneCode = phoneCodeFromEvent(event);
      if (!phoneCode) {
        uni.showToast({ title: '未获得手机号授权', icon: 'none' });
        return false;
      }
      try {
        await userStore.bindPhoneByCode(phoneCode);
        completed = true;
        uni.showToast({ title: '手机号已授权', icon: 'none' });
        return true;
      } catch (error) {
        uni.showToast({ title: loginErrorText(error, '手机号授权失败'), icon: 'none' });
        return false;
      }
    }
  });
  return completed || isPhoneBound(userStore.user);
}

function isPhoneBound(user: Record<string, unknown> | null | undefined) {
  return Boolean(user?.phoneBound || user?.phone);
}

function phoneCodeFromEvent(event: unknown) {
  const detail = (event as { detail?: { code?: unknown } } | undefined)?.detail;
  return String(detail?.code || '').trim();
}

function loginErrorText(error: unknown, fallback = '微信登录失败，请稍后重试') {
  const message = error instanceof Error ? error.message.trim() : '';
  return message ? message.slice(0, 60) : fallback;
}
