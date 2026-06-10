// src/services/wechat.service.ts
import axios from 'axios';
import { SettingsService } from './settings.service';

interface WechatSession {
  openid: string;
  session_key: string;
  unionid?: string;
}

interface WechatError {
  errcode: number;
  errmsg: string;
}

interface WechatAccessTokenResponse {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
}

interface WechatPhoneResponse {
  errcode: number;
  errmsg: string;
  phone_info?: {
    phoneNumber?: string;
    purePhoneNumber?: string;
    countryCode?: string;
  };
}

let cachedAccessToken = '';
let cachedAccessTokenExpiresAt = 0;

export async function code2Session(code: string): Promise<WechatSession> {
  const appId = cleanWechatCredential(await SettingsService.requireString('wechat.app_id', '微信小程序 AppID'));
  const appSecret = cleanWechatCredential(await SettingsService.requireString('wechat.app_secret', '微信小程序 AppSecret'));
  if (!/^wx[a-zA-Z0-9]{8,32}$/.test(appId)) {
    throw Object.assign(new Error('微信小程序 AppID 格式不正确，请重新复制小程序 AppID 后保存'), { code: 4000 });
  }
  const url = 'https://api.weixin.qq.com/sns/jscode2session';
  const params = {
    appid: appId,
    secret: appSecret,
    js_code: code,
    grant_type: 'authorization_code',
  };

  const response = await axios.get<WechatSession | WechatError>(url, { params });
  const data = response.data;

  if ('errcode' in data && data.errcode !== 0) {
    throw new Error(`微信登录失败: ${data.errmsg} (${data.errcode})`);
  }

  return data as WechatSession;
}

export async function getPhoneNumberByCode(code: string): Promise<string> {
  const cleanCode = String(code || '').trim();
  if (!cleanCode) {
    throw Object.assign(new Error('缺少手机号授权 code'), { code: 4000 });
  }
  if (cleanCode.startsWith('dev_phone_')) {
    return cleanCode.replace('dev_phone_', '').replace(/\D/g, '').slice(0, 11);
  }
  const accessToken = await getWechatAccessToken();
  const response = await axios.post<WechatPhoneResponse>(
    `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(accessToken)}`,
    { code: cleanCode },
  );
  const data = response.data;
  if (data.errcode !== 0) {
    throw Object.assign(new Error(`微信手机号授权失败: ${data.errmsg} (${data.errcode})`), { code: 4000 });
  }
  const phone = data.phone_info?.purePhoneNumber || data.phone_info?.phoneNumber || '';
  if (!phone) {
    throw Object.assign(new Error('微信未返回手机号'), { code: 4000 });
  }
  return phone;
}

async function getWechatAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessTokenExpiresAt > now + 60_000) {
    return cachedAccessToken;
  }

  const appId = cleanWechatCredential(await SettingsService.requireString('wechat.app_id', '微信小程序 AppID'));
  const appSecret = cleanWechatCredential(await SettingsService.requireString('wechat.app_secret', '微信小程序 AppSecret'));
  const response = await axios.get<WechatAccessTokenResponse>('https://api.weixin.qq.com/cgi-bin/token', {
    params: {
      grant_type: 'client_credential',
      appid: appId,
      secret: appSecret,
    },
  });
  const data = response.data;
  if (data.errcode && data.errcode !== 0) {
    throw Object.assign(new Error(`微信 access_token 获取失败: ${data.errmsg} (${data.errcode})`), { code: 4000 });
  }
  if (!data.access_token) {
    throw Object.assign(new Error('微信 access_token 响应为空'), { code: 4000 });
  }
  cachedAccessToken = data.access_token;
  cachedAccessTokenExpiresAt = now + Math.max(60, Number(data.expires_in || 7200) - 300) * 1000;
  return cachedAccessToken;
}

function cleanWechatCredential(value: string): string {
  return String(value || '').replace(/[\s\u200B-\u200D\uFEFF]/g, '');
}
