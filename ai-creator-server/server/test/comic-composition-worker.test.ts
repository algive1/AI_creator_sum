import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { isPrivateAddress, normalizeShot, probeMedia, targetDimensions } from '../src/services/comic-composition-worker.service';
import { compositionQueueJobId } from '../src/services/comic-composition-queue.service';

const compositionServiceSource = readFileSync(new URL('../src/services/comic-composition.service.ts', import.meta.url), 'utf8');
const compositionWorkerSource = readFileSync(new URL('../src/services/comic-composition-worker.service.ts', import.meta.url), 'utf8');

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

test('comic composition resolves server-owned task output assets instead of trusting client URLs', () => {
  assert.match(compositionServiceSource, /taskId/);
  assert.match(compositionServiceSource, /t\.user_id = \?/);
  assert.match(compositionServiceSource, /t\.status/);
  assert.match(compositionServiceSource, /o\.output_type = 'video'/);
  assert.match(compositionServiceSource, /media_assets/);
  assert.match(compositionServiceSource, /files f/);
  assert.match(compositionServiceSource, /未通过内容审核/);
  assert.doesNotMatch(compositionServiceSource, /raw\?\.url \|\| raw\?\.outputUrl/);
});

test('comic composition output is registered as a file and project media asset', () => {
  assert.match(compositionWorkerSource, /ref_type = 'comic_composition'/);
  assert.match(compositionWorkerSource, /createUploadedMediaAsset/);
  assert.match(compositionWorkerSource, /output_file_id=\?/);
  assert.match(compositionWorkerSource, /file_category, visibility, ref_type, ref_id/);
});

test('comic composition actually normalizes mixed ffmpeg inputs to one compatible stream shape', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'comic-compose-test-'));
  try {
    const sourceA = join(dir, 'a.mp4');
    const sourceB = join(dir, 'b.mp4');
    const normalizedA = join(dir, 'a-normalized.mp4');
    const normalizedB = join(dir, 'b-normalized.mp4');
    execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:r=24:d=1',
      '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', sourceA
    ], { stdio: 'ignore' });
    execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-y', '-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=25:d=1',
      '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=1',
      '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', sourceB
    ], { stdio: 'ignore' });

    const probeA = await probeMedia(sourceA);
    const probeB = await probeMedia(sourceB);
    await normalizeShot(sourceA, normalizedA, probeA, 320, 240);
    await normalizeShot(sourceB, normalizedB, probeB, 320, 240);

    const outA = await probeMedia(normalizedA);
    const outB = await probeMedia(normalizedB);
    assert.deepEqual([outA.width, outA.height], [320, 240]);
    assert.deepEqual([outB.width, outB.height], [320, 240]);
    assert.equal(outA.hasAudio, true);
    assert.equal(outB.hasAudio, true);
    assert.ok(outA.duration > 0);
    assert.ok(outB.duration > 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
