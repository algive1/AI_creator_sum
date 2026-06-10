import assert from 'node:assert/strict';
import { applyXiaomaVideoParams } from '../src/services/adapters/xiaoma-video-param-mapper';

function main(): void {
  const refs = Array.from({ length: 10 }, (_, index) => `https://img.example/${index}.png`);
  const sdAllReference: any = { images: refs };
  applyXiaomaVideoParams(sdAllReference, { duration: 'auto', ratio: 'adaptive', resolution: '1080p' }, 'kwvideo-v2-quannengcankao');
  assert.equal(sdAllReference.images.length, 9);
  assert.equal(sdAllReference.duration, 'auto');
  assert.equal(sdAllReference.aspect_ratio, 'adaptive');

  const veoFirstLast: any = { images: ['https://img.example/first.png', 'https://img.example/last.png'] };
  applyXiaomaVideoParams(veoFirstLast, { videoMode: 'first_last_frame_video', duration: '8s', resolution: '4k' }, 'veo3.1-4k');
  assert.equal(veoFirstLast.generation_type, 'FIRST&LAST');
  assert.deepEqual(veoFirstLast.images, ['https://img.example/first.png', 'https://img.example/last.png']);

  const happyhorseEdit: any = { video_url: 'https://video.example/source.mp4' };
  applyXiaomaVideoParams(happyhorseEdit, { duration: '5s', resolution: '720P' }, 'happyhorse-video-edit');
  assert.equal(happyhorseEdit.video_url, 'https://video.example/source.mp4');
  assert.equal(happyhorseEdit.duration, '5');
  assert.equal(happyhorseEdit.resolution, '720P');

  const advancedParams: any = { audioUrl: 'https://audio.example/bgm.mp3' };
  applyXiaomaVideoParams(advancedParams, { seed: 12345, audioFileId: 88 }, 'omni-flash');
  assert.equal(advancedParams.seed, 12345);
  assert.equal(advancedParams.audio_url, 'https://audio.example/bgm.mp3');
  assert.equal(advancedParams.audio_file_id, 88);
  assert.equal(advancedParams.audioUrl, undefined);

  console.log('check:xiaoma-video-params passed');
}

try {
  main();
} catch (err: any) {
  console.error('check:xiaoma-video-params failed:', err?.message || err);
  process.exitCode = 1;
}
