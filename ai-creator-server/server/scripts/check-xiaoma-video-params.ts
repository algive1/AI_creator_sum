import assert from 'node:assert/strict';
import { buildXiaomaMediaParams, XiaomaAdapter, buildXiaomaTaskStatusUrl } from '../src/services/adapters/xiaoma.adapter';
import { applyXiaomaDeclaredValueFormats, applyXiaomaVideoParams } from '../src/services/adapters/xiaoma-video-param-mapper';
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

  const originalQualityCase: any = { resolution: '720p', size: '720p' };
  applyXiaomaDeclaredValueFormats(originalQualityCase, {
    supported_qualities: ['720P', '1080P'],
  });
  assert.equal(originalQualityCase.resolution, '720P');
  assert.equal(originalQualityCase.size, '720P');

  const grokParams = buildXiaomaMediaParams({
    upstreamCode: 'grok-video-3',
    taskType: 'text_to_video',
    prompt: 'landscape scene',
    params: { ratio: '16:9', duration: '6s', resolution: '720p' },
    modelConfig: { supported_qualities: ['720P', '1080P'] },
    providerConfig: { baseUrl: 'https://xiaoma.example', apiKey: 'test', timeout: 1000, protocolType: 'rest', authType: 'bearer' },
  });
  assert.equal(grokParams.size, '720P', 'Xiaoma should receive the configured quality spelling');

  const miniSizeParams = buildXiaomaMediaParams({
    upstreamCode: 'kwvideo-v2-ref',
    taskType: 'text_to_video',
    prompt: 'mini-program size contract',
    params: { ratio: '16:9', duration: '5s', width: 1920, height: 1080, nativeSize: '1920x1080' },
    modelConfig: { param_names: ['prompt', 'aspect_ratio', 'duration'] },
    providerConfig: { baseUrl: 'https://xiaoma.example', apiKey: 'test', timeout: 1000, protocolType: 'rest', authType: 'bearer' },
  });
  assert.equal(miniSizeParams.width, undefined, 'mini-program target pixels are not an Xiaoma API field');
  assert.equal(miniSizeParams.height, undefined, 'mini-program target pixels are not an Xiaoma API field');

  const defaultVideoParams = buildXiaomaMediaParams({
    upstreamCode: 'kling-avatar-image2video',
    taskType: 'image_to_video',
    prompt: 'provider default mapping',
    images: ['https://img.example/avatar.png'],
    params: { ratio: '16:9' },
    modelConfig: {
      param_names: ['image', 'sound_file', 'prompt', 'mode'],
      default_params: { mode: 'std', undeclared: 'must-not-send' },
    },
    providerConfig: { baseUrl: 'https://xiaoma.example', apiKey: 'test', timeout: 1000, protocolType: 'rest', authType: 'bearer' },
  });
  assert.equal(defaultVideoParams.mode, 'std', 'declared Xiaoma default params should be preserved');
  assert.equal(defaultVideoParams.undeclared, undefined, 'undeclared Xiaoma defaults must not be sent');
  assert.equal(defaultVideoParams.image, 'https://img.example/avatar.png', 'Xiaoma param_names should map the image alias');
  assert.equal(defaultVideoParams.images, undefined, 'Xiaoma singular image fields should not receive the plural alias');

  const referenceUrlParams = buildXiaomaMediaParams({
    upstreamCode: 'kwvideo-v2-quannengcankao',
    taskType: 'image_to_video',
    prompt: 'reference URL mapping',
    images: ['https://img.example/one.png', 'https://img.example/two.png'],
    params: { ratio: '16:9', duration: '5s' },
    modelConfig: {
      param_names: ['_quan_neng_mode', 'duration', 'aspect_ratio', 'image_url'],
      max_reference_images: 9,
    },
    providerConfig: { baseUrl: 'https://xiaoma.example', apiKey: 'test', timeout: 1000, protocolType: 'rest', authType: 'bearer' },
  });
  assert.deepEqual(referenceUrlParams.image_url, ['https://img.example/one.png', 'https://img.example/two.png']);

  const parsed = new XiaomaAdapter().parseResult({
    data: { task: { output: { video_url: 'https://cdn.example/result.mp4' } } },
  }, '');
  assert.deepEqual(parsed.urls, ['https://cdn.example/result.mp4']);

  console.log('check:xiaoma-video-params passed');
}

try {
  main();
} catch (err: any) {
  console.error('check:xiaoma-video-params failed:', err?.message || err);
  process.exitCode = 1;
}
