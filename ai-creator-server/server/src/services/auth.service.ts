// src/services/auth.service.ts
import jwt from 'jsonwebtoken';
import { config } from '../utils/config';
import { JwtPayload } from '../types';

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwt.secret) as JwtPayload;
}

export function generateRefreshToken(userId: number): string {
  return jwt.sign({ userId, type: 'refresh' }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn * 2,
  });
}

export function verifyRefreshToken(token: string): { userId: number; type: string } {
  return jwt.verify(token, config.jwt.secret) as { userId: number; type: string };
}
