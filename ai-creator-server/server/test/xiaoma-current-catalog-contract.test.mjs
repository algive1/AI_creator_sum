import test from 'node:test';
import assert from 'node:assert/strict';

const { buildXiaomaMediaParams, XiaomaAdapter } = await import('../src/services/adapters/xiaoma.adapter.ts');
const { isGptImage2Model, isNanoBananaModel } = await import('../src/services/adapters/image-param-mapper.ts');
const { buildImageSizeCapabilities, normalizeRatioPreset, resolveGptImage2UpstreamSize } = await import('../src/services/image-size-options.service.ts');

const providerConfig = {
  baseUrl: 'https://xiaoma.example',
  apiKey: 'test-key',
  timeout: 1000,
  protocolType: 'rest',
  authType: 'bearer',
};

function buildMedia(overrides) {
  return buildXiaomaMediaParams({ providerConfig, prompt: 'test prompt', images: [], ...overrides });
}

test('maps qwen-image ratio to its required size field', () => {
  const params = buildMedia({
    upstreamCode: 'qwen-image',
    taskType: 'text_to_image',
    params: { ratio: '21:9', resolutionPreset: '2K', imageCount: 1 },
    modelConfig: {
      param_names: ['prompt', 'images', 'size', 'prompt_extend'],
      remote_parameters: [
        { name: 'prompt', required: true },
        { name: 'images' },
        { name: 'size', required: true, options: [{ value: '1:1' }, { value: '21:9' }] },
        { name: 'prompt_extend', options: [{ value: 'true' }] },
      ],
      default_params: { size: '1:1', prompt_extend: 'true' },
    },
  });

  assert.equal(params.size, '21:9');
  assert.equal(params.prompt_extend, 'true');
  assert.equal(params.aspect_ratio, undefined);
});

test('maps current Banana model fields without reducing 21:9 to 7:3', () => {
  const params = buildMedia({
    upstreamCode: 'banana-2',
    taskType: 'text_to_image',
    params: { ratio: '21:9', resolutionPreset: '2K', imageCount: 1 },
    modelConfig: {
      param_names: ['prompt', 'images', 'aspectRatio', 'imageSize'],
      remote_parameters: [
        { name: 'prompt', required: true },
        { name: 'images' },
        { name: 'aspectRatio', required: true },
        { name: 'imageSize', required: true, options: [{ value: '2K' }] },
      ],
    },
  });

  assert.equal(params.aspectRatio, '21:9');
  assert.equal(params.imageSize, '2K');
  assert.equal(params.aspect_ratio, undefined);
  assert.equal(params.size, undefined);
});

test('maps TT Image 2 dimensions and does not invent an unsupported n parameter', () => {
  const params = buildMedia({
    upstreamCode: 'tt-image-2',
    taskType: 'text_to_image',
    params: {
      ratio: '4:5',
      resolutionPreset: '1K',
      imageCount: 2,
      sizeOption: { ratio: '4:5', resolutionPreset: '1K', upstreamSize: '1024x1280' },
    },
    modelConfig: {
      param_names: ['prompt', 'images', 'size', 'quality'],
      remote_parameters: [
        { name: 'prompt', required: true },
        { name: 'images' },
        { name: 'size', required: true },
        { name: 'quality' },
      ],
    },
  });

  assert.equal(params.size, '1024x1280');
  assert.equal(params.n, undefined);
  assert.equal(params.quality, undefined);
});

test('maps current video aliases gk-video-3 and vo3.1 to declared upstream fields', () => {
  const grok = buildMedia({
    upstreamCode: 'gk-video-3',
    taskType: 'image_to_video',
    images: ['https://cdn.example/first.png'],
    params: { ratio: '16:9', resolution: '720p', duration: '10s' },
    modelConfig: {
      param_names: ['prompt', 'images', 'aspect_ratio', 'size', 'duration'],
      remote_parameters: [
        { name: 'prompt', required: true },
        { name: 'images' },
        { name: 'aspect_ratio', required: true },
        { name: 'size', required: true, options: [{ value: '720P' }] },
        { name: 'duration', required: true, options: [{ value: '10' }] },
      ],
    },
  });
  assert.equal(grok.size, '720P');
  assert.equal(grok.resolution, undefined);
  assert.equal(grok.duration, '10');

  const veo = buildMedia({
    upstreamCode: 'vo3.1',
    taskType: 'first_last_frame_video',
    images: ['https://cdn.example/first.png', 'https://cdn.example/last.png'],
    params: { ratio: '16:9', resolution: '1080p', duration: '8s', videoMode: 'first_last_frame_video' },
    modelConfig: {
      param_names: ['prompt', 'generation_mode', 'aspect_ratio', 'images', 'enhance_prompt', 'enable_upsample', 'duration', 'generation_type', 'quality'],
      default_params: { generation_mode: 'fast', enhance_prompt: true, enable_upsample: false },
      remote_parameters: [
        { name: 'prompt', required: true },
        { name: 'generation_mode', required: true },
        { name: 'aspect_ratio', required: true },
        { name: 'images' },
        { name: 'enhance_prompt', required: true },
        { name: 'enable_upsample', required: true },
        { name: 'duration' },
        { name: 'generation_type' },
        { name: 'quality', options: [{ value: '1080p' }] },
      ],
    },
  });
  assert.equal(veo.quality, '1080p');
  assert.equal(veo.resolution, undefined);
  assert.equal(veo.generation_type, 'FIRST&LAST');
});

test('keeps current Xiaoma ratio and output-size capabilities aligned', () => {
  assert.equal(normalizeRatioPreset('21:9'), '21:9');
  assert.equal(resolveGptImage2UpstreamSize('4:5', '1K'), '1024x1280');

  const capabilities = buildImageSizeCapabilities({
    providerType: 'xiaoma',
    modelName: 'TT Image 2',
    upstreamModelCode: 'tt-image-2',
    modelConfig: {
      param_names: ['prompt', 'images', 'size', 'quality'],
      size_options: [{ key: '4:5_1K', ratio: '4:5', resolutionPreset: '1K', upstreamSize: '1024x1280' }],
    },
    ratios: ['4:5'],
    qualities: ['1K'],
    maxImages: 4,
  });

  assert.equal(capabilities.sizeOptions[0].ratio, '4:5');
  assert.equal(capabilities.maxImages, 1);
});

test('does not apply Xiaoma Banana mapping to Hongniao model IDs', () => {
  assert.equal(isNanoBananaModel('banana-2'), true);
  assert.equal(isNanoBananaModel('banana-pro-token'), true);
  assert.equal(isNanoBananaModel('banana2-S'), false);
  assert.equal(isNanoBananaModel('gr-banana-pro'), false);
});

test('scopes Xiaoma TT Image 2 mapping away from shared providers', () => {
  assert.equal(isGptImage2Model('tt-image-2'), false);
  assert.equal(isGptImage2Model('tt-image-2', 'hongniao'), false);
  assert.equal(isGptImage2Model('tt-image-2', 'xiaoma'), true);
});

test('maps the current Xiaoma video extension clips field as an array', () => {
  const params = buildMedia({
    upstreamCode: 'wan2.7-xuxie',
    taskType: 'video_edit',
    images: [],
    params: {
      duration: '6s',
      resolution: '1080p',
      videoUrls: ['https://cdn.example/clip.mp4'],
    },
    modelConfig: {
      param_names: ['prompt', 'clips', 'resolution', 'duration'],
      remote_parameters: [
        { name: 'prompt' },
        { name: 'clips', required: true, type: 'upload' },
        { name: 'resolution', required: true, options: [{ value: '1080P' }] },
        { name: 'duration', required: true, options: [{ value: '6' }] },
      ],
    },
  });

  assert.deepEqual(params.clips, ['https://cdn.example/clip.mp4']);
  assert.equal(params.video_url, undefined);
  assert.equal(params.resolution, '1080P');
  assert.equal(params.duration, '6');
});

test('reports Xiaoma media cost in the documented CNY currency', () => {
  assert.deepEqual(new XiaomaAdapter().parseCost({ cost: 1.23 }), {
    apiCostCents: 123,
    apiCurrency: 'CNY',
    apiRawCost: 1.23,
  });
});
