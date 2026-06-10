import { devEnv } from '@/env/dev';
import { post } from './request';

export interface LoginResponse {
  token: string;
  refreshToken?: string;
  expiresIn: string;
  user: Record<string, unknown>;
  points: unknown;
  membership: unknown;
  warning?: { code: number; message: string };
}

export function wechatLogin(code: string, inviteCode?: string) {
  return post<LoginResponse>('/auth/wechat-login', { code, inviteCode }, { loading: '登录中', dedupe: false, silent: true });
}

export function refreshToken(value: string) {
  return post<{ token: string; refreshToken?: string; expiresIn: string }>('/auth/refresh-token', { refreshToken: value }, { dedupe: false });
}

export function devLogin(inviteCode?: string) {
  return wechatLogin(devEnv.devLoginCode, inviteCode);
}

export function loginByUniCode(inviteCode?: string) {
  return new Promise<LoginResponse>((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success: (res) => {
        if (!res.code) {
          reject(new Error('微信登录未返回 code'));
          return;
        }
        wechatLogin(res.code, inviteCode).then(resolve).catch(reject);
      },
      fail: reject
    });
  });
}
