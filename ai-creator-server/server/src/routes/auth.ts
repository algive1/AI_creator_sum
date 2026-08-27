// src/routes/auth.ts
import { Router, Request, Response } from 'express';
import { code2Session } from '../services/wechat.service';
import { generateToken, generateRefreshToken, verifyRefreshToken } from '../services/auth.service';
import { findOrCreateUserByEmail, findOrCreateUserByOpenid, loginUserByEmail } from '../services/user.service';
import { bindInviteCode } from '../services/invite.service';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import { config } from '../utils/config';
import { SettingsService } from '../services/settings.service';

type ClientType = 'miniprogram' | 'web' | 'app';
type TokenTransport = 'body' | 'cookie';

const router = Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function normalizePassword(value: unknown): string {
  return String(value || '');
}

function normalizeNickname(value: unknown): string {
  return String(value || '').trim().slice(0, 64);
}

function normalizeClientType(value: unknown): ClientType {
  return value === 'web' || value === 'app' || value === 'miniprogram' ? value : 'miniprogram';
}

function normalizeTokenTransport(value: unknown): TokenTransport {
  return value === 'cookie' ? 'cookie' : 'body';
}

function readCookie(req: Request, name: string): string {
  const cookies = String(req.headers.cookie || '').split(';');
  for (const cookie of cookies) {
    const [key, ...parts] = cookie.trim().split('=');
    if (key === name) return decodeURIComponent(parts.join('='));
  }
  return '';
}

function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  const secure = config.nodeEnv === 'production' ? '; Secure' : '';
  const maxAge = Math.max(60, Number(config.jwt.refreshExpiresIn || 31536000));
  res.append('Set-Cookie', `bang_refresh_token=${encodeURIComponent(refreshToken)}; HttpOnly; Path=/api/v1/auth; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

function clearRefreshTokenCookie(res: Response): void {
  const secure = config.nodeEnv === 'production' ? '; Secure' : '';
  res.append('Set-Cookie', `bang_refresh_token=; HttpOnly; Path=/api/v1/auth; SameSite=Lax; Max-Age=0${secure}`);
}

function validateEmailPassword(res: Response, email: string, password: string): boolean {
  if (!EMAIL_PATTERN.test(email) || email.length > 128) {
    error(res, ErrorCodes.PARAM_ERROR, '邮箱格式不正确');
    return false;
  }
  if (password.length < 8 || password.length > 72) {
    error(res, ErrorCodes.PARAM_ERROR, '密码长度需为 8-72 位');
    return false;
  }
  return true;
}

async function bindOptionalInvite(userId: number, inviteCode: unknown, source: 'wechat_share' | 'web_register') {
  const normalizedInviteCode = String(inviteCode || '').trim();
  if (!normalizedInviteCode) return null;

  try {
    const result = await bindInviteCode(userId, normalizedInviteCode, source);
    if (result.reward?.status === 'failed') {
      console.warn('[Invite] reward failed during auth binding:', {
        userId,
        inviteCode: normalizedInviteCode,
        reason: result.reward.reason,
      });
    }
    return null;
  } catch (inviteError: any) {
    const inviteWarning = {
      code: inviteError?.code || ErrorCodes.SERVER_ERROR,
      message: inviteError?.message || '邀请绑定失败',
    };
    console.warn('[Invite] bind failed during auth:', {
      userId,
      inviteCode: normalizedInviteCode,
      code: inviteWarning.code,
      message: inviteWarning.message,
    });
    return inviteWarning;
  }
}

function buildAuthResponse(userData: any, clientType: ClientType, inviteWarning: any = null) {
  const token = generateToken({
    userId: userData.user.id,
    role: 'user',
    clientType,
  });
  const refreshToken = generateRefreshToken(userData.user.id, clientType);

  const response: any = {
    token,
    refreshToken,
    expiresIn: config.jwt.expiresIn,
    refreshTokenExpiresIn: config.jwt.refreshExpiresIn,
    user: userData.user,
    points: userData.points,
    membership: userData.membership,
  };
  if (inviteWarning) response.warning = inviteWarning;
  return response;
}

function sendAuthResponse(res: Response, userData: any, clientType: ClientType, tokenTransport: TokenTransport, inviteWarning: any = null) {
  const response = buildAuthResponse(userData, clientType, inviteWarning);
  if (tokenTransport === 'cookie') {
    setRefreshTokenCookie(res, response.refreshToken);
    delete response.refreshToken;
    response.tokenTransport = 'cookie';
  }
  success(res, response);
}

// POST /api/v1/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const emailValue = normalizeEmail(req.body?.email);
    const password = normalizePassword(req.body?.password);
    const nickname = normalizeNickname(req.body?.nickname);

    if (!validateEmailPassword(res, emailValue, password)) return;

    const userData = await findOrCreateUserByEmail({ email: emailValue, password, nickname });
    const inviteWarning = await bindOptionalInvite(userData.user.id, req.body?.inviteCode, 'web_register');
    const clientType: ClientType = req.body?.clientType === 'app' ? 'app' : 'web';
    sendAuthResponse(res, userData, clientType, normalizeTokenTransport(req.body?.tokenTransport), inviteWarning);
  } catch (err: any) {
    console.error('邮箱注册失败:', err);
    if (err.code && err.code < 5000) error(res, err.code, err.message);
    else error(res, ErrorCodes.SERVER_ERROR, err.message || '注册失败，请重试');
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const emailValue = normalizeEmail(req.body?.email);
    const password = normalizePassword(req.body?.password);

    if (!validateEmailPassword(res, emailValue, password)) return;

    const userData = await loginUserByEmail(emailValue, password);
    const clientType: ClientType = req.body?.clientType === 'app' ? 'app' : 'web';
    sendAuthResponse(res, userData, clientType, normalizeTokenTransport(req.body?.tokenTransport));
  } catch (err: any) {
    console.error('邮箱登录失败:', err);
    if (err.code && err.code < 5000) error(res, err.code, err.message);
    else error(res, ErrorCodes.SERVER_ERROR, err.message || '登录失败，请重试');
  }
});

// POST /api/v1/auth/wechat-login
router.post('/wechat-login', async (req: Request, res: Response) => {
  try {
    const { code, inviteCode } = req.body;

    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      error(res, ErrorCodes.PARAM_ERROR, '缺少code参数');
      return;
    }

    let openid: string;
    let unionid: string | undefined;
    const loginEnabled = await SettingsService.getBoolean('wechat.login_enabled', true);
    if (!loginEnabled) {
      error(res, ErrorCodes.PARAM_ERROR, '微信登录未启用');
      return;
    }

    if (code.startsWith('dev_')) {
      const bypassEnabled = await SettingsService.getBoolean('wechat.login_bypass_dev', false);
      if (bypassEnabled && config.nodeEnv === 'development') {
        openid = code;
        console.warn('[DEV] WeChat login bypass used');
      } else {
        error(res, ErrorCodes.PARAM_ERROR, '开发登录旁路未启用');
        return;
      }
    } else {
      const session = await code2Session(code);
      openid = session.openid;
      unionid = session.unionid;
    }

    const userData = await findOrCreateUserByOpenid(openid, unionid);
    const inviteWarning = await bindOptionalInvite(userData.user.id, inviteCode, 'wechat_share');
    success(res, buildAuthResponse(userData, 'miniprogram', inviteWarning));
  } catch (err: any) {
    console.error('微信登录失败:', err);
    if (err.code && err.code < 5000) error(res, err.code, err.message);
    else error(res, ErrorCodes.SERVER_ERROR, err.message || '登录失败，请重试');
  }
});

// POST /api/v1/auth/refresh-token
router.post('/refresh-token', (req: Request, res: Response) => {
  try {
    const bodyRefreshToken = req.body?.refreshToken;
    const cookieRefreshToken = readCookie(req, 'bang_refresh_token');
    const refreshTokenValue = typeof bodyRefreshToken === 'string' && bodyRefreshToken.trim() ? bodyRefreshToken.trim() : cookieRefreshToken;
    if (!refreshTokenValue) {
      error(res, ErrorCodes.PARAM_ERROR, '缺少refreshToken参数');
      return;
    }

    const payload = verifyRefreshToken(refreshTokenValue);
    if (payload.type !== 'refresh') {
      error(res, ErrorCodes.UNAUTHORIZED, '无效的刷新令牌', 401);
      return;
    }

    const clientType = normalizeClientType(payload.clientType || req.body?.clientType);
    const token = generateToken({
      userId: payload.userId,
      role: 'user',
      clientType,
    });
    const refreshToken = generateRefreshToken(payload.userId, clientType);

    const tokenTransport = cookieRefreshToken && !bodyRefreshToken ? 'cookie' : normalizeTokenTransport(req.body?.tokenTransport);
    const response: any = {
      token,
      refreshToken,
      expiresIn: config.jwt.expiresIn,
      refreshTokenExpiresIn: config.jwt.refreshExpiresIn,
    };
    if (tokenTransport === 'cookie') {
      setRefreshTokenCookie(res, refreshToken);
      delete response.refreshToken;
      response.tokenTransport = 'cookie';
    }
    success(res, response);
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      error(res, ErrorCodes.UNAUTHORIZED, '刷新令牌已过期，请重新登录', 401);
    } else {
      error(res, ErrorCodes.UNAUTHORIZED, '无效的刷新令牌', 401);
    }
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  clearRefreshTokenCookie(res);
  success(res, { loggedOut: true });
});

export default router;
