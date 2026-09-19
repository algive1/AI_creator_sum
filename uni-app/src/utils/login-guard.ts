import type { LoginResponse } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import { useUserStore } from '@/stores/user';
import { showAppDialog } from '@/utils/app-dialog';
import { isDevFallbackEnabled } from '@/utils/dev-fallback';
import { recordPhoneAuthorizationPrompted } from '@/utils/phone-authorization';

interface LoginGuardOptions {
  title?: string;
  subtitle?: string;
  inviteCode?: string;
}

let loginPromise: Promise<boolean> | null = null;

export async function ensureLoggedIn(options: LoginGuardOptions = {}): Promise<boolean> {
  const authStore = useAuthStore();
  await authStore.hydrate();
  if (authStore.isLoggedIn) return true;
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
    primaryLabel: '手机号快捷登录',
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
  const loginPayload = pendingLogin as LoginResponse;

  // 登录响应已携带服务端手机号绑定状态；已绑定账号不再重复请求 getPhoneNumber。
  if (isPhoneBound(loginPayload.user)) {
    await authStore.applyLogin(loginPayload);
    uni.showToast({ title: '登录成功', icon: 'none' });
    return true;
  }

  let completed = false;
  const completeOptionalPhoneLogin = async (title: string) => {
    await authStore.applyLogin(loginPayload);
    await recordPhoneAuthorizationPrompted();
    completed = true;
    uni.showToast({ title, icon: 'none' });
    return true;
  };
  await showAppDialog({
    variant: 'phone',
    hideVisual: true,
    title: '手机号快捷登录',
    subtitle: '绑定后可用于账号安全校验；暂不授权也可直接登录。',
    primaryLabel: '手机号快捷登录',
    secondaryLabel: '暂不绑定，直接登录',
    primaryOpenType: 'getPhoneNumber',
    maskClosable: false,
    onGetPhoneNumber: async (event: unknown) => {
      const phoneCode = phoneCodeFromEvent(event);
      if (!phoneCode) {
        return completeOptionalPhoneLogin('未获得手机号，已登录');
      }
      try {
        const profile = await userStore.bindPhoneByCode(phoneCode, loginPayload.token);
        await authStore.applyLogin(loginPayload);
        await authStore.markPhoneBoundFromProfile(profile);
        completed = true;
        uni.showToast({ title: '登录成功', icon: 'none' });
        return true;
      } catch {
        return completeOptionalPhoneLogin('手机号未绑定，已登录');
      }
    },
    onSecondary: () => completeOptionalPhoneLogin('已登录，可在我的页面绑定手机号')
  });

  return completed && authStore.isLoggedIn;
}

function isPhoneBound(user: Record<string, unknown> | null | undefined) {
  return Boolean(user?.phoneBound || user?.phone);
}

function phoneCodeFromEvent(event: unknown) {
  const detail = (event as { detail?: { code?: unknown } } | undefined)?.detail;
  return String(detail?.code || '').trim();
}

function loginErrorText(error: unknown, fallback = '登录失败，请稍后重试') {
  const message = error instanceof Error ? error.message.trim() : '';
  return message ? message.slice(0, 60) : fallback;
}
