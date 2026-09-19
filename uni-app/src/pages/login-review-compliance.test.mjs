import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(here, '..');

function read(relativePath) {
  return readFileSync(join(sourceRoot, relativePath), 'utf8');
}

test('手机号快捷登录前置界面不展示平台官方标识或微信字样', () => {
  const loginPage = read('pages/login/index.vue');
  const loginGuard = read('utils/login-guard.ts');
  const homePage = read('pages/home/index.vue');
  const profilePage = read('pages/profile/index.vue');
  const authApi = read('api/auth.ts');

  for (const source of [loginPage, loginGuard, homePage, profilePage, authApi]) {
    assert.doesNotMatch(source, /微信/);
  }

  assert.match(loginPage, />手机号快捷登录</);
  assert.doesNotMatch(loginPage, /<(?:image|icon)\b/i);
  assert.doesNotMatch(loginPage, /url\(/i);

  for (const source of [loginGuard, homePage]) {
    assert.match(source, /title:\s*'手机号快捷登录'/);
    assert.match(source, /primaryLabel:\s*[^\n]*'手机号快捷登录'/);
    assert.match(source, /primaryOpenType:\s*'getPhoneNumber'/);
    assert.match(source, /hideVisual:\s*true/);
  }

  assert.match(profilePage, />手机号快捷登录</);
});

test('合规文案调整不改变真实小程序登录与手机号绑定调用链', () => {
  const loginGuard = read('utils/login-guard.ts');
  const authApi = read('api/auth.ts');

  assert.match(loginGuard, /loginWithWechatTemporary/);
  assert.match(loginGuard, /bindPhoneByCode\([^,\n]+,\s*loginPayload\.token\)/);
  assert.match(authApi, /provider:\s*'weixin'/);
  assert.match(authApi, /\/auth\/wechat-login/);
});
