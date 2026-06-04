// src/routes/auth.ts
import { Router, Request, Response } from 'express';
import { code2Session } from '../services/wechat.service';
import { generateToken, generateRefreshToken, verifyRefreshToken } from '../services/auth.service';
import { findOrCreateUserByOpenid } from '../services/user.service';
import { bindInviteCode } from '../services/invite.service';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import { config } from '../utils/config';
import { SettingsService } from '../services/settings.service';

const router = Router();

// POST /api/v1/auth/wechat-login
router.post('/wechat-login', async (req: Request, res: Response) => {
  try {
    const { code, inviteCode } = req.body;

    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      error(res, ErrorCodes.PARAM_ERROR, '缺少code参数');
      return;
    }

    // 开发环境跳过微信验证
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

    let inviteWarning: { code: number; message: string } | null = null;
    if (inviteCode && String(inviteCode).trim()) {
      try {
        const result = await bindInviteCode(userData.user.id, inviteCode, 'wechat_share');
        if (result.reward?.status === 'failed') {
          console.warn('[Invite] reward failed during login binding:', {
            userId: userData.user.id,
            inviteCode,
            reason: result.reward.reason,
          });
        }
      } catch (inviteError: any) {
        inviteWarning = {
          code: inviteError?.code || ErrorCodes.SERVER_ERROR,
          message: inviteError?.message || '邀请绑定失败',
        };
        console.warn('[Invite] bind failed during login:', {
          userId: userData.user.id,
          inviteCode,
          code: inviteWarning.code,
          message: inviteWarning.message,
        });
      }
    }

    const token = generateToken({
      userId: userData.user.id,
      role: 'user',
      clientType: 'miniprogram',
    });
    const refreshToken = generateRefreshToken(userData.user.id);

    const response: any = {
      token,
      refreshToken,
      expiresIn: config.jwt.expiresIn,
      refreshTokenExpiresIn: config.jwt.expiresIn * 2,
      user: userData.user,
      points: userData.points,
      membership: userData.membership,
    };
    if (inviteWarning) response.warning = inviteWarning;

    success(res, response);
  } catch (err: any) {
    console.error('微信登录失败:', err);
    if (err.code && err.code < 5000) error(res, err.code, err.message);
    else error(res, ErrorCodes.SERVER_ERROR, err.message || '登录失败，请重试');
  }
});

// POST /api/v1/auth/refresh-token
router.post('/refresh-token', (req: Request, res: Response) => {
  try {
    const { refreshToken: bodyRefreshToken } = req.body;
    if (!bodyRefreshToken || typeof bodyRefreshToken !== 'string' || !bodyRefreshToken.trim()) {
      error(res, ErrorCodes.PARAM_ERROR, '缺少refreshToken参数');
      return;
    }

    const payload = verifyRefreshToken(bodyRefreshToken);
    if (payload.type !== 'refresh') {
      error(res, ErrorCodes.UNAUTHORIZED, '无效的刷新令牌', 401);
      return;
    }

    const token = generateToken({
      userId: payload.userId,
      role: 'user',
      clientType: 'miniprogram',
    });
    const refreshToken = generateRefreshToken(payload.userId);

    success(res, {
      token,
      refreshToken,
      expiresIn: config.jwt.expiresIn,
      refreshTokenExpiresIn: config.jwt.expiresIn * 2,
    });
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      error(res, ErrorCodes.UNAUTHORIZED, '刷新令牌已过期，请重新登录', 401);
    } else {
      error(res, ErrorCodes.UNAUTHORIZED, '无效的刷新令牌', 401);
    }
  }
});

export default router;
