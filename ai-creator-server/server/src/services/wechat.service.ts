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

export async function code2Session(code: string): Promise<WechatSession> {
  const appId = await SettingsService.requireString('wechat.app_id', '微信小程序 AppID');
  const appSecret = await SettingsService.requireString('wechat.app_secret', '微信小程序 AppSecret');
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
