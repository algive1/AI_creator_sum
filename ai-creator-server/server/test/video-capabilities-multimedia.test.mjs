import test from 'node:test';
import assert from 'node:assert/strict';

const { buildVideoCapabilities } = await import('../src/services/video-capabilities.service.ts');

test('video capabilities expose multimedia input limits from explicit config fields', () => {
  const caps = buildVideoCapabilities({
    featureKey: 'image_to_video',
    modelConfig: {
      max_reference_images: 4,
      max_video_urls: 2,
      max_audio_urls: 1,
    },
  });

  assert.deepEqual(caps.inputMediaTypes, ['image', 'video', 'audio']);
  assert.equal(caps.maxReferenceImages, 4);
  assert.equal(caps.maxVideoUrls, 2);
  assert.equal(caps.maxAudioUrls, 1);
});

test('video capabilities infer multimedia inputs from param names and keep text-only empty', () => {
  const inferred = buildVideoCapabilities({
    featureKey: 'video_create',
    modelConfig: {
      param_names: ['prompt', 'reference_video_urls', 'audioUrls'],
    },
  });

  assert.deepEqual(inferred.inputMediaTypes, ['video', 'audio']);
  assert.equal(inferred.maxVideoUrls, 1);
  assert.equal(inferred.maxAudioUrls, 1);

  const textOnly = buildVideoCapabilities({
    featureKey: 'video_create',
    modelConfig: {
      param_names: ['prompt', 'duration', 'aspect_ratio'],
    },
  });

  assert.deepEqual(textOnly.inputMediaTypes, []);
  assert.equal(textOnly.maxVideoUrls, 0);
  assert.equal(textOnly.maxAudioUrls, 0);
});

test('video capabilities recognize bare media parameter names and preserve explicit zero overrides', () => {
  const inferred = buildVideoCapabilities({
    featureKey: 'video_edit',
    modelConfig: {
      param_names: ['prompt', 'video', 'audio'],
      max_video_urls: 3,
      max_audio_urls: 1,
    },
  });

  assert.deepEqual(inferred.inputMediaTypes, ['image', 'video', 'audio']);
  assert.equal(inferred.maxVideoUrls, 3);
  assert.equal(inferred.maxAudioUrls, 1);

  const disabled = buildVideoCapabilities({
    featureKey: 'video_edit',
    maxVideoUrls: 0,
    maxAudioUrls: 0,
    modelConfig: {
      param_names: ['prompt', 'video', 'audio'],
      max_video_urls: 3,
      max_audio_urls: 1,
    },
  });
  assert.equal(disabled.maxVideoUrls, 0);
  assert.equal(disabled.maxAudioUrls, 0);
});

test('video capabilities recognize provider-specific media aliases', () => {
  const caps = buildVideoCapabilities({
    featureKey: 'video_edit',
    modelConfig: {
      param_names: ['reference_urls', 'reference_video', 'sound_file'],
    },
  });

  assert.deepEqual(caps.inputMediaTypes, ['image', 'video', 'audio']);
  assert.equal(caps.maxVideoUrls, 1);
  assert.equal(caps.maxAudioUrls, 1);
});

test('video capabilities do not treat an audio switch as an upload input', () => {
  const caps = buildVideoCapabilities({
    featureKey: 'video_create',
    modelConfig: {
      param_names: ['prompt', 'audio'],
      remote_parameters: [{ name: 'audio', type: 'switch' }],
    },
  });

  assert.deepEqual(caps.inputMediaTypes, []);
  assert.equal(caps.maxAudioUrls, 0);
});
