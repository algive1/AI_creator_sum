import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorkLibraryItems,
  buildWorkLibraryOverview,
  buildWorkLibraryStats,
} from './work-library.ts';

const tasks = [
  {
    id: 1,
    type: 'image',
    title: '已完成海报',
    status: 'completed',
    progress: 100,
    ratio: '4:5',
    style: '写实',
    prompt: '夏日饮品促销海报',
    createdAt: '2026-06-01 10:00:00',
    outputs: [{ id: 11, image: 'https://example.com/poster.png' }],
  },
  {
    id: 2,
    type: 'video',
    title: '生成中短片',
    status: 'processing',
    progress: 66,
    duration: '5s',
    prompt: '产品开箱短视频',
    createdAt: '2026-06-02 10:00:00',
  },
  {
    id: 3,
    type: 'image',
    title: '失败头像',
    status: 'failed',
    failReason: '提示词包含不可用内容',
    prompt: '头像',
    createdAt: '2026-05-30 10:00:00',
  },
];

test('buildWorkLibraryStats reports honest task counts without fake saved-time metrics', () => {
  const stats = buildWorkLibraryStats(tasks, new Date('2026-06-14T00:00:00+08:00'));

  assert.deepEqual(stats, {
    total: 3,
    month: 2,
    active: 1,
    completed: 1,
    failed: 1,
  });
});

test('buildWorkLibraryItems keeps active work first and supports failure filtering', () => {
  const all = buildWorkLibraryItems(tasks, '全部');
  const failed = buildWorkLibraryItems(tasks, '失败');

  assert.equal(all[0].id, 2);
  assert.equal(all[0].statusLabel, '生成中');
  assert.equal(all[0].progress, 66);
  assert.equal(all[1].id, 1);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].failReason, '提示词包含不可用内容');
});

test('buildWorkLibraryItems searches title and prompt text', () => {
  const result = buildWorkLibraryItems(tasks, '全部', '饮品');

  assert.equal(result.length, 1);
  assert.equal(result[0].title, '已完成海报');
});

test('buildWorkLibraryOverview keeps every planned asset category visible', () => {
  const assetTasks = [
    ...tasks,
    {
      id: 4,
      type: 'image',
      title: '白发少女主角',
      status: 'completed',
      prompt: '白发少女主角 角色设定',
      createdAt: '2026-06-03 10:00:00',
    },
    {
      id: 5,
      type: 'image',
      title: '古风庭院场景',
      status: 'completed',
      prompt: '古风庭院场景 背景',
      createdAt: '2026-06-04 10:00:00',
    },
    {
      id: 6,
      type: 'image',
      title: '魔法权杖道具',
      status: 'completed',
      prompt: '魔法权杖 道具',
      createdAt: '2026-06-05 10:00:00',
    },
    {
      id: 7,
      type: 'audio',
      title: '温柔女声配音',
      status: 'completed',
      prompt: '温柔女声 配音 声音',
      createdAt: '2026-06-06 10:00:00',
    },
    {
      id: 8,
      type: 'script',
      title: '星旅漫剧剧本',
      status: 'completed',
      prompt: '星旅漫剧 剧本 分镜脚本',
      createdAt: '2026-06-07 10:00:00',
    },
    {
      id: 9,
      type: 'comic',
      title: '梦幻森林漫剧',
      status: 'completed',
      prompt: '梦幻森林漫剧',
      createdAt: '2026-06-08 10:00:00',
    },
  ];
  const overview = buildWorkLibraryOverview(assetTasks, new Date('2026-06-14T00:00:00+08:00'));
  const countOf = (key) => overview.categories.find((item) => item.key === key)?.count;

  assert.deepEqual(overview.categories.map((item) => item.key), ['图片', '视频', '漫剧', '角色', '场景', '道具', '声音', '剧本']);
  assert.equal(countOf('图片'), 5);
  assert.equal(countOf('视频'), 1);
  assert.equal(countOf('漫剧'), 1);
  assert.equal(countOf('角色'), 2);
  assert.equal(countOf('场景'), 1);
  assert.equal(countOf('道具'), 1);
  assert.equal(countOf('声音'), 1);
  assert.equal(countOf('剧本'), 1);
});

test('buildWorkLibraryItems filters semantic asset categories while preserving media filters', () => {
  const assetTasks = [
    ...tasks,
    {
      id: 4,
      type: 'image',
      title: '白发少女主角',
      status: 'completed',
      prompt: '白发少女主角 角色设定',
      createdAt: '2026-06-03 10:00:00',
    },
  ];

  const roles = buildWorkLibraryItems(assetTasks, '角色');
  const images = buildWorkLibraryItems(assetTasks, '图片');

  assert.deepEqual(roles.map((item) => item.id), [4, 3]);
  assert.equal(images.some((item) => item.id === 4), true);
});

test('buildWorkLibraryOverview limits recent assets to four completed works', () => {
  const manyCompletedTasks = Array.from({ length: 6 }, (_, index) => ({
    id: index + 10,
    type: 'image',
    title: `作品 ${index + 1}`,
    status: 'completed',
    prompt: '作品库最近使用',
    createdAt: `2026-06-${String(index + 1).padStart(2, '0')} 10:00:00`,
  }));

  const overview = buildWorkLibraryOverview(manyCompletedTasks, new Date('2026-06-14T00:00:00+08:00'));

  assert.deepEqual(overview.recent.map((item) => item.id), [15, 14, 13, 12]);
});

test('buildWorkLibraryItems exposes a normal date-time label for latest content', () => {
  const result = buildWorkLibraryItems([
    {
      id: 20,
      type: 'image',
      title: '日期展示作品',
      status: 'completed',
      prompt: '检查日期展示',
      createdAt: '2026-06-09 08:30:00',
    },
  ], '全部');

  assert.equal(result[0].displayDate, '2026-06-09 08:30:00');
});

test('buildWorkLibraryItems exposes stable resolution and file size labels for result cards', () => {
  const result = buildWorkLibraryItems([
    {
      id: 21,
      type: 'image',
      title: '详情明确的作品',
      status: 'completed',
      prompt: '用于作品库卡片展示',
      createdAt: '2026-06-10 08:30:00',
      outputs: [{
        image: 'https://example.com/output.png',
        width: 1024,
        height: 1536,
        fileSize: 2516582,
      }],
    },
  ], '全部');

  assert.equal(result[0].displayResolution, '1024 x 1536');
  assert.equal(result[0].displayFileSize, '2.4MB');
  assert.equal(result[0].resultMeta, '1024 x 1536 · 2.4MB');
});
