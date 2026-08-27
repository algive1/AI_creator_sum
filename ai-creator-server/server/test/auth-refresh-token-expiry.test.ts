import test from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRES_IN = '7200';
process.env.JWT_REFRESH_EXPIRES_IN = '31536000';

test('refresh token uses the dedicated long-lived mini-program TTL', async () => {
  const { generateRefreshToken } = await import('../src/services/auth.service');
  const jwtModule = await import('jsonwebtoken');
  const jwt = jwtModule.default || jwtModule;

  const decoded = jwt.decode(generateRefreshToken(123)) as { iat?: number; exp?: number } | null;

  assert.ok(decoded?.iat);
  assert.ok(decoded?.exp);
  assert.equal(decoded.exp - decoded.iat, 31536000);
});
