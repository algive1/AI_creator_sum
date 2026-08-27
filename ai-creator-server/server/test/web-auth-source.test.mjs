import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const authRoute = readFileSync(new URL('../src/routes/auth.ts', import.meta.url), 'utf8');
const userService = readFileSync(new URL('../src/services/user.service.ts', import.meta.url), 'utf8');
const migrationDir = fileURLToPath(new URL('../src/migrations/', import.meta.url));
const migrations = readdirSync(migrationDir).map((name) => ({
  name,
  source: readFileSync(join(migrationDir, name), 'utf8'),
}));

test('public auth exposes email register and login routes for web users', () => {
  assert.match(authRoute, /router\.post\(\s*['"`]\/register['"`]/);
  assert.match(authRoute, /router\.post\(\s*['"`]\/login['"`]/);
  assert.match(authRoute, /buildAuthResponse\([\s\S]*['"`]web['"`]/);
  assert.match(authRoute, /generateRefreshToken\(/);
  assert.match(authRoute, /findOrCreateUserByEmail\(/);
  assert.match(authRoute, /loginUserByEmail\(/);
});

test('email auth hashes passwords and initializes the same user assets as wechat registration', () => {
  assert.match(userService, /bcrypt/);
  assert.match(userService, /findOrCreateUserByEmail/);
  assert.match(userService, /loginUserByEmail/);
  assert.match(userService, /password_hash/);
  assert.match(userService, /account_type,\s*status/);
  assert.match(userService, /'email'/);
  assert.match(userService, /INSERT INTO point_accounts/);
  assert.match(userService, /INSERT INTO user_assets/);
});

test('email auth migration adds a unique email index without touching existing openid users', () => {
  const webAuthMigration = migrations.find((item) => /web.*email|email.*auth|user.*web/i.test(item.name));
  assert.ok(webAuthMigration, 'expected a web/email auth migration file');
  assert.match(webAuthMigration.source, /users/);
  assert.match(webAuthMigration.source, /email/);
  assert.match(webAuthMigration.source, /UNIQUE/i);
  assert.doesNotMatch(webAuthMigration.source, /DROP\s+COLUMN\s+openid/i);
});
