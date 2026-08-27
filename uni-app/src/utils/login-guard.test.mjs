import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(here, '..');

function read(relativePath) {
  return readFileSync(join(sourceRoot, relativePath), 'utf8');
}

test('login guard completes login only after phone binding succeeds', () => {
  const guardPath = join(sourceRoot, 'utils/login-guard.ts');
  assert.equal(existsSync(guardPath), true, 'login guard utility should exist');
  const guardSource = read('utils/login-guard.ts');
  assert.match(guardSource, /export async function ensureLoggedIn/);
  assert.match(guardSource, /loginWithWechatTemporary/);
  assert.match(guardSource, /bindPhoneByCode\([^,\n]+,\s*pendingLogin\.token\)/);
  assert.match(guardSource, /applyLogin\(pendingLogin\)/);
  assert.match(guardSource, /markPhoneBoundFromProfile\(profile\)/);
});

test('login dialog advances to phone authorization after temporary login succeeds', () => {
  const guardSource = read('utils/login-guard.ts');
  const loginDialog = guardSource.match(/const loginResult = await showAppDialog\(\{([\s\S]*?)\n  \}\);/)?.[1] || '';
  assert.match(loginDialog, /hideVisual:\s*true/);
  assert.doesNotMatch(loginDialog, /closeOnPrimary:\s*false/);
  assert.doesNotMatch(loginDialog, /closeOnMinor:\s*false/);
});

test('existing token sessions must bind phone before protected work continues', () => {
  const guardSource = read('utils/login-guard.ts');
  assert.match(guardSource, /if \(authStore\.isLoggedIn\) return ensurePhoneBound/);
  assert.match(guardSource, /async function ensurePhoneBound/);
  assert.match(guardSource, /phoneBound/);
});

test('phone binding persists the bound state for later authorization checks', () => {
  const userStoreSource = read('stores/user.ts');
  const authStoreSource = read('stores/auth.ts');
  const homeSource = read('pages/home/index.vue');
  assert.match(userStoreSource, /useAuthStore/);
  assert.match(userStoreSource, /markPhoneBoundFromProfile\(profile\)/);
  assert.match(authStoreSource, /markPhoneBoundFromProfile/);
  assert.match(authStoreSource, /phoneBound:\s*true/);
  assert.match(homeSource, /authStore\.user\?\.phoneBound/);
});

test('home agreement dialog skips stale server-required state after same-version local consent', () => {
  const homeSource = read('pages/home/index.vue');
  assert.match(homeSource, /hasStoredLegalConsent\(signature\)/);
  assert.match(homeSource, /syncLegalConsentToServer\(docs,\s*'first_open'\)/);
  assert.match(homeSource, /markHomeLegalAccepted\(\)/);
  assert.match(homeSource, /serverCheckedAgreement && !serverRequiresAgreement/);
});

test('announcement popup is text-only without a modal icon', () => {
  const homeSource = read('pages/home/index.vue');
  const announcementDialog = homeSource.match(/async function maybeShowAnnouncementDialog\(\)[\s\S]*?await showAppDialog\(\{([\s\S]*?)\n  \}\);/)?.[1] || '';
  assert.match(announcementDialog, /variant:\s*'announcement'/);
  assert.match(announcementDialog, /hideVisual:\s*true/);
  assert.doesNotMatch(announcementDialog, /image:\s*['"]/);
});

test('phone authorization dialogs hide decorative visuals', () => {
  const guardSource = read('utils/login-guard.ts');
  const dialogs = [...guardSource.matchAll(/await showAppDialog\(\{([\s\S]*?)\n  \}\);/g)].map((match) => match[1]);
  const phoneDialogs = dialogs.filter((block) => /variant:\s*'phone'/.test(block));
  assert.equal(phoneDialogs.length >= 2, true, 'expected both phone authorization dialogs to be present');
  for (const block of phoneDialogs) {
    assert.match(block, /hideVisual:\s*true/);
    assert.doesNotMatch(block, /image:\s*['"]/);
  }

  const homeSource = read('pages/home/index.vue');
  const homePhoneDialog = homeSource.match(/async function maybeShowPhoneDialog\(\)[\s\S]*?await showAppDialog\(\{([\s\S]*?)\n  \}\);/)?.[1] || '';
  assert.match(homePhoneDialog, /variant:\s*'phone'/);
  assert.match(homePhoneDialog, /hideVisual:\s*true/);
  assert.doesNotMatch(homePhoneDialog, /image:\s*['"`]/);
});

test('prompt guide dialogs keep close behavior on primary and secondary actions', () => {
  const imageSource = read('pages/ai-image/index.vue');
  const videoSource = read('pages/ai-video/index.vue');
  const comicSource = read('pages/comic/index.vue');
  for (const source of [imageSource, videoSource, comicSource]) {
    const dialog = source.match(/showAppDialog\(\{([\s\S]*?)\n  \}\);/)?.[1] || '';
    assert.match(dialog, /hideVisual:\s*true/);
    assert.match(dialog, /closeOnMinor:\s*false/);
    assert.doesNotMatch(dialog, /closeOnPrimary:\s*false/);
    assert.doesNotMatch(dialog, /closeOnSecondary:\s*false/);
  }
});

test('request layer asks for modal login instead of relaunching login page on 401', () => {
  const requestSource = read('api/request.ts');
  assert.match(requestSource, /onLoginRequired/);
  assert.doesNotMatch(requestSource, /uni\.reLaunch\(\{\s*url:\s*`\$\{PAGE_ROUTES\.login/);
});

test('protected page actions use login guard instead of direct login page navigation', () => {
  const files = [
    'pages/ai-image/index.vue',
    'pages/ai-video/index.vue',
    'pages/comic/index.vue',
    'pages/favorites/index.vue',
    'pages/history/index.vue',
    'pages/home/index.vue',
    'pages/inspiration/index.vue',
    'pages/member/index.vue',
    'pages/points/index.vue',
    'pages/tools/index.vue',
    'pages/tools/run/index.vue',
  ];

  for (const file of files) {
    const source = read(file);
    assert.match(source, /ensureLoggedIn/, `${file} should use the login guard`);
    assert.doesNotMatch(source, /PAGE_ROUTES\.login/, `${file} should not navigate to the login page directly`);
  }
});
