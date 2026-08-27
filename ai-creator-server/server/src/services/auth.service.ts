// src/services/auth.service.ts
import jwt from 'jsonwebtoken';
import { config } from '../utils/config';
import { JwtPayload } from '../types';

export type RefreshClientType = JwtPayload['clientType'];

export interface RefreshTokenPayload {
  userId: number;
  type: 'refresh';
  clientType?: RefreshClientType;
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwt.secret) as JwtPayload;
}

export function generateRefreshToken(userId: number, clientType: RefreshClientType = 'miniprogram'): string {
  return jwt.sign({ userId, type: 'refresh', clientType }, config.jwt.secret, {
    expiresIn: config.jwt.refreshExpiresIn,
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, config.jwt.secret) as RefreshTokenPayload;
}
