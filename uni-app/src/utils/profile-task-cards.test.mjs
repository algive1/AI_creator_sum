import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/utils/profile-task-cards.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const { selectProfileQuickTaskCards } = await import(moduleUrl);

const cards = [
  { id: 'freeImage', title: '免费生图', sub: '', action: '', image: '', className: 'free-image' },
  { id: 'points', title: '购买积分', sub: '', action: '', image: '', className: 'points' },
  { id: 'ad', title: '看广告得积分', sub: '', action: '', image: '', className: 'ad' },
  { id: 'checkin', title: '每日签到', sub: '', action: '', image: '', className: 'checkin' },
  { id: 'invite', title: '邀请好友', sub: '', action: '', image: '', className: 'invite' },
];

test('selects four visible profile task cards', () => {
  assert.deepEqual(selectProfileQuickTaskCards(cards).map((item) => item.id), [
    'freeImage',
    'points',
    'ad',
    'checkin',
  ]);
});

test('fills with other task cards when free image quota task is hidden', () => {
  assert.deepEqual(selectProfileQuickTaskCards([
    { ...cards[0], visible: false },
    ...cards.slice(1),
  ]).map((item) => item.id), [
    'points',
    'ad',
    'checkin',
    'invite',
  ]);
});

test('shows all available cards when fewer than four are visible', () => {
  assert.deepEqual(selectProfileQuickTaskCards([
    { ...cards[0], visible: false },
    { ...cards[1], visible: false },
    cards[2],
    cards[3],
  ]).map((item) => item.id), ['ad', 'checkin']);
});
