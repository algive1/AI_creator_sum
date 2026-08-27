/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';

const videoPolling = await import('../src/services/video-polling.service.ts');

const { resolveProviderPollingLimits } = videoPolling;

test('image polling honors model max_polling_minutes instead of capping at default', () => {
  const previousMinutes = process.env.IMAGE_TASK_MAX_RUNNING_MINUTES;
  const previousCount = process.env.IMAGE_TASK_MAX_POLL_COUNT;
  process.env.IMAGE_TASK_MAX_RUNNING_MINUTES = '5';
  delete process.env.IMAGE_TASK_MAX_POLL_COUNT;

  try {
    const limits = resolveProviderPollingLimits('image', { max_polling_minutes: 20 });
    assert.equal(limits.maxRunningMinutes, 20);
    assert.equal(limits.maxPollCount, 240);
  } finally {
    if (previousMinutes === undefined) delete process.env.IMAGE_TASK_MAX_RUNNING_MINUTES;
    else process.env.IMAGE_TASK_MAX_RUNNING_MINUTES = previousMinutes;
    if (previousCount === undefined) delete process.env.IMAGE_TASK_MAX_POLL_COUNT;
    else process.env.IMAGE_TASK_MAX_POLL_COUNT = previousCount;
  }
});

test('default polling limits are long enough for slow image and video providers', () => {
  const previousImageMinutes = process.env.IMAGE_TASK_MAX_RUNNING_MINUTES;
  const previousImageCount = process.env.IMAGE_TASK_MAX_POLL_COUNT;
  const previousVideoMinutes = process.env.VIDEO_TASK_MAX_RUNNING_MINUTES;
  const previousVideoCount = process.env.VIDEO_TASK_MAX_POLL_COUNT;
  delete process.env.IMAGE_TASK_MAX_RUNNING_MINUTES;
  delete process.env.IMAGE_TASK_MAX_POLL_COUNT;
  delete process.env.VIDEO_TASK_MAX_RUNNING_MINUTES;
  delete process.env.VIDEO_TASK_MAX_POLL_COUNT;

  try {
    assert.deepEqual(resolveProviderPollingLimits('image', {}), {
      maxRunningMinutes: 20,
      maxPollCount: 240,
    });
    assert.deepEqual(resolveProviderPollingLimits('video', {}), {
      maxRunningMinutes: 30,
      maxPollCount: 240,
    });
  } finally {
    if (previousImageMinutes === undefined) delete process.env.IMAGE_TASK_MAX_RUNNING_MINUTES;
    else process.env.IMAGE_TASK_MAX_RUNNING_MINUTES = previousImageMinutes;
    if (previousImageCount === undefined) delete process.env.IMAGE_TASK_MAX_POLL_COUNT;
    else process.env.IMAGE_TASK_MAX_POLL_COUNT = previousImageCount;
    if (previousVideoMinutes === undefined) delete process.env.VIDEO_TASK_MAX_RUNNING_MINUTES;
    else process.env.VIDEO_TASK_MAX_RUNNING_MINUTES = previousVideoMinutes;
    if (previousVideoCount === undefined) delete process.env.VIDEO_TASK_MAX_POLL_COUNT;
    else process.env.VIDEO_TASK_MAX_POLL_COUNT = previousVideoCount;
  }
});
