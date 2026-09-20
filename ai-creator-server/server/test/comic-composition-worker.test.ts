import test from 'node:test';
import assert from 'node:assert/strict';

import { isPrivateAddress, targetDimensions } from '../src/services/comic-composition-worker.service';
import { compositionQueueJobId } from '../src/services/comic-composition-queue.service';

test('comic composition blocks private and link-local addresses', () => {
  for (const value of ['127.0.0.1', '10.0.0.8', '192.168.1.2', '172.16.0.1', '172.31.255.254', '169.254.1.1', '100.64.0.1', '::1', 'fc00::1', 'fd12::1', 'fe80::1']) {
    assert.equal(isPrivateAddress(value), true, value);
  }
  assert.equal(isPrivateAddress('8.8.8.8'), false);
  assert.equal(isPrivateAddress('1.1.1.1'), false);
});

test('comic composition normalizes oversized media to even dimensions', () => {
  assert.deepEqual(targetDimensions({ width: 3840, height: 2160, duration: 5, hasAudio: true }), { width: 1920, height: 1080 });
  assert.deepEqual(targetDimensions({ width: 1080, height: 1920, duration: 5, hasAudio: false }), { width: 1080, height: 1920 });
  const result = targetDimensions({ width: 853, height: 479, duration: 5, hasAudio: false });
  assert.equal(result.width % 2, 0);
  assert.equal(result.height % 2, 0);
});

test('comic composition uses its own positive durable queue namespace', () => {
  assert.equal(compositionQueueJobId(12), 'comic-composition-12');
  assert.throws(() => compositionQueueJobId(0), /invalid comic composition job id/);
  assert.throws(() => compositionQueueJobId(-12), /invalid comic composition job id/);
});
