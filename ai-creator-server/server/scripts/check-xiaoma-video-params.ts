import assert from 'node:assert/strict';
import { buildXiaomaTaskStatusUrl } from '../src/services/adapters/xiaoma.adapter';
import { applyXiaomaVideoParams } from '../src/services/adapters/xiaoma-video-param-mapper';
import { buildVideoCapabilities } from '../src/services/video-capabilities.service';

function main(): void {
  assert.equal(
    buildXiaomaTaskStatusUrl({ baseUrl: 'https://api.lk888.ai/api' }, '123'),
    'https://api.lk888.ai/api/v1/skills/task-status?task_id=123',
  );
  assert.equal(
    buildXiaomaTaskStatusUrl({ baseUrl: 'https://api.lk888.ai/api', queryTaskUrl: '/v1/media/status?task_id={task_id}' }, 'abc'),
    'https://api.lk888.ai/api/v1/media/status?task_id=abc',
  );

  const refs = Array.from({ length: 10 }, (_, index) => `https://img.example/${index}.png`);
  const sdAllReference: any = { images: refs };
  applyXiaomaVideoParams(sdAllReference, { duration: 'auto', ratio: 'adaptive', resolution: '1080p' }, 'kwvideo-v2-quannengcankao');
  assert.equal(sdAllReference.images, undefined);
  assert.deepEqual(sdAllReference.image_url, refs.slice(0, 9));
  assert.equal(sdAllReference.duration, 'auto');
  assert.equal(sdAllReference.aspect_ratio, 'adaptive');

  const sdReferenceSpeed: any = { images: refs };
  applyXiaomaVideoParams(sdReferenceSpeed, { duration: '5s', ratio: '21:9', resolution: '720p' }, 'kwvideo-v2-ref');
  assert.equal(sdReferenceSpeed.version, undefined);
  assert.equal(sdReferenceSpeed.aspect_ratio, '21:9');

  const sdReferenceStandard: any = { images: refs };
  applyXiaomaVideoParams(sdReferenceStandard, { duration: '5s', ratio: '21:9', resolution: '720p', version: '标准' }, 'kwvideo-v2-ref');
  assert.equal(sdReferenceStandard.version, '标准');

  const sdCaps = buildVideoCapabilities({
    featureKey: 'image_to_video',
    modelName: 'SD 2.0 Reference-to-Video',
    apiModelName: 'kwvideo-v2-ref',
    modelConfig: {
      supported_ratios: ['adaptive', '16:9', '21:9'],
      supported_qualities: ['480p', '720p'],
      supported_durations: ['auto', '5s'],
      param_names: ['version', 'duration', 'aspect_ratio', 'resolution', 'images'],
    },
    ratios: ['adaptive', '16:9', '21:9'],
    qualities: ['480p', '720p'],
    durations: ['auto', '5s'],
    audioModes: ['audio'],
    inputMode: 'reference_images',
    referenceUploadMode: 'reference_images',
    minReferenceImages: 1,
    maxReferenceImages: 9,
  });
  assert.deepEqual(sdCaps.ratios, ['adaptive', '16:9', '21:9']);
  assert.deepEqual(sdCaps.advancedParams, []);

  const sdAllReferenceCaps = buildVideoCapabilities({
    featureKey: 'image_to_video',
    modelName: 'SD 2.0 All-purpose Reference',
    apiModelName: 'kwvideo-v2-quannengcankao',
    modelConfig: {
      supported_ratios: ['adaptive', '16:9', '21:9'],
      param_names: ['_quan_neng_mode', 'duration', 'aspect_ratio', 'resolution', 'image_url', 'video_url', 'audio_url'],
    },
    ratios: ['adaptive', '16:9', '21:9'],
    qualities: ['480p', '720p', '1080p'],
    durations: ['auto', '5s'],
    audioModes: ['audio'],
    inputMode: 'reference_images',
    referenceUploadMode: 'reference_images',
    minReferenceImages: 1,
    maxReferenceImages: 9,
  });
  assert.deepEqual(sdAllReferenceCaps.advancedParams, ['audioUrl']);

  const veoFirstLast: any = { images: ['https://img.example/first.png', 'https://img.example/last.png'] };
  applyXiaomaVideoParams(veoFirstLast, { videoMode: 'first_last_frame_video', duration: '8s', resolution: '4k' }, 'veo3.1-4k');
  assert.equal(veoFirstLast.generation_type, 'FIRST&LAST');
  assert.deepEqual(veoFirstLast.images, ['https://img.example/first.png', 'https://img.example/last.png']);

  const happyhorseEdit: any = { video_url: 'https://video.example/source.mp4' };
  applyXiaomaVideoParams(happyhorseEdit, { duration: '5s', resolution: '720P' }, 'happyhorse-video-edit');
  assert.equal(happyhorseEdit.video, 'https://video.example/source.mp4');
  assert.equal(happyhorseEdit.video_url, undefined);
  assert.equal(happyhorseEdit.duration, undefined);
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
