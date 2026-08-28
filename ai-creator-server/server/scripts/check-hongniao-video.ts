import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import { HongniaoAdapter, buildHongniaoQueryUrl } from '../src/services/adapters/hongniao.adapter';
import { AdapterRegistry } from '../src/services/adapters/adapter.registry';
import { fetchRemoteModels } from '../src/services/model-sync.service';
import { buildVideoCapabilities } from '../src/services/video-capabilities.service';

type AxiosPost = typeof axios.post;
type AxiosGet = typeof axios.get;

const originalPost: AxiosPost = axios.post.bind(axios);
const originalGet: AxiosGet = axios.get.bind(axios);

interface HttpCall {
  method: 'POST' | 'GET';
  url: string;
  body?: any;
  headers?: Record<string, string>;
}

async function withMockedHttp<T>(
  handler: (call: HttpCall) => any,
  run: (calls: HttpCall[]) => Promise<T>,
): Promise<T> {
  const calls: HttpCall[] = [];
  (axios as any).post = async (url: string, body: any, options: any = {}) => {
    const call: HttpCall = { method: 'POST', url, body, headers: options.headers || {} };
    calls.push(call);
    return { status: 200, data: handler(call) };
  };
  (axios as any).get = async (url: string, options: any = {}) => {
    const call: HttpCall = { method: 'GET', url, headers: options.headers || {} };
    calls.push(call);
    return { status: 200, data: handler(call) };
  };
  try {
    return await run(calls);
  } finally {
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
  }
}

async function main(): Promise<void> {
  const root = path.resolve(__dirname, '..');
  const adminTiers = fs.readFileSync(path.join(root, 'src/routes/admin-tiers.ts'), 'utf8');
  const providerKeySync = fs.readFileSync(path.join(root, 'src/services/provider-key-sync.service.ts'), 'utf8');
  const modelSync = fs.readFileSync(path.join(root, 'src/services/model-sync.service.ts'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'src/migrations/20260615_002_seed_hongniao_video_provider.sql'), 'utf8');
  const imageMigration = fs.readFileSync(path.join(root, 'src/migrations/20260615_003_seed_hongniao_image_models.sql'), 'utf8');
  const domainMigration = fs.readFileSync(path.join(root, 'src/migrations/20260707_002_hongniao_open_domain_and_sync_metadata.sql'), 'utf8');

  assert(adminTiers.includes('resolveVideoTestParams'), 'real model tests should use provider/model video default params');
  assert(adminTiers.includes('defaultParams.seconds'), 'video model tests should honor default_params.seconds');
  assert(providerKeySync.includes("'HONGNIAO_API_KEY'"), 'HONGNIAO_API_KEY should sync into provider api_key');
  assert(modelSync.includes("providerType === 'hongniao'") || modelSync.includes("providerKey === 'hongniao'"), 'provider model sync should have a Hongniao-specific branch');
  assert(modelSync.includes("'X-API-Key'"), 'Hongniao model sync should use X-API-Key instead of Authorization');
  assert(modelSync.includes('data.models'), 'Hongniao model sync should parse data.models from /v1/models');
  assert(modelSync.includes('tasks'), 'Hongniao model sync should parse current tasks[].parameters response shape');
  assert(modelSync.includes('removals'), 'provider model sync preview should include remote removals');
  assert(modelSync.includes('remote_parameters'), 'Hongniao sync should preserve raw remote parameter metadata');
  assert(modelSync.includes('generateHongniaoSeedMigration'), 'Hongniao sync script should be able to regenerate seed migration SQL');
  assert(migration.includes("provider_key = 'hongniao'"), 'migration should seed hongniao provider');
  assert(domainMigration.includes('https://open.hongniaoai.com/v1'), 'new migration should update Hongniao provider to open.hongniaoai.com');
  assert(domainMigration.includes("LIKE 'https://hongniaoai.com%'"), 'new migration should only replace the old Hongniao domain');
  assert(domainMigration.includes('upstream_removed_at'), 'new migration should document the soft-removal config marker');
  const repairMigrationPath = path.join(root, 'src/migrations/20260619_001_repair_hongniao_model_pricing_from_billing.sql');
  const repairMigration = fs.readFileSync(repairMigrationPath, 'utf8');
  assert(repairMigration.includes("JSON_EXTRACT(m.config, '$.billing.amount')"), 'repair migration should read Hongniao billing amount from model config');
  assert(repairMigration.includes('IF(COALESCE(m.points_cost, 0) = 0'), 'repair migration should preserve non-zero manual points pricing');
  assert(migration.includes('tier_model_bindings'), 'migration should bind Hongniao video tiers to real models');
  assert(migration.includes('tier_capabilities'), 'migration should seed Hongniao public tier capabilities');
  assert(imageMigration.includes("'gpt-image-2'"), 'image migration should seed Hongniao GPT Image 2');
  assert(imageMigration.includes("'gemini-3-pro-image-preview'"), 'image migration should seed Hongniao Nano Banana Pro');
  assert(imageMigration.includes("'gemini-3.1-flash-image-preview'"), 'image migration should seed Hongniao Nano Banana 2');
  assert(imageMigration.includes("'/api/v1/images/{id}'"), 'Hongniao image models should use the image query endpoint');
  assert(imageMigration.includes("'api_format', 'hongniao_image'"), 'Hongniao image models should be marked as hongniao_image');

  assert.equal(buildHongniaoQueryUrl('https://open.hongniaoai.com', '', 'video_1'), 'https://open.hongniaoai.com/api/v1/videos/video_1');
  assert.equal(buildHongniaoQueryUrl('https://open.hongniaoai.com/v1', '', 'video_1'), 'https://open.hongniaoai.com/api/v1/videos/video_1');
  assert.equal(buildHongniaoQueryUrl('https://open.hongniaoai.com', '/api/v1/videos/{id}', 'video_1'), 'https://open.hongniaoai.com/api/v1/videos/video_1');
  assert.equal(buildHongniaoQueryUrl('https://open.hongniaoai.com', 'https://open.hongniaoai.com/api/v1/videos/id', 'video_1'), 'https://open.hongniaoai.com/api/v1/videos/video_1');

  const sizeRatioCaps = buildVideoCapabilities({
    featureKey: 'image_to_video',
    providerType: 'hongniao',
    modelName: 'Hongniao Veo 3.1 XS',
    modelConfig: {
      supported_ratios: ['1280x720', '720x1280'],
      supported_durations: ['8s'],
    },
    ratios: ['1280x720', '720x1280'],
    durations: ['8s'],
    inputMode: 'reference_images',
    referenceUploadMode: 'reference_images',
    minReferenceImages: 1,
    maxReferenceImages: 2,
  });
  assert.deepEqual(sizeRatioCaps.ratios, ['16:9', '9:16'], 'Hongniao size ratios should become mini-program ratios');

  await withMockedHttp((call) => {
    assert.equal(call.method, 'GET');
    assert.equal(call.url, 'https://open.hongniaoai.com/v1/models');
    assert.equal(call.headers?.['X-API-Key'], 'sk_test');
    assert.equal(call.headers?.Authorization, undefined);
    return {
      code: 0,
      message: 'success',
      data: {
        models: [
          {
            id: 'banana2-S',
            name: 'banana2-S',
            type: 'image_generation',
            pricing: { type: 'per_call', amount: 0.09, currency: 'CNY' },
            status: 'available',
            tasks: [{
              taskKind: 'image.generate',
              parameters: [
                { name: 'prompt', mapsTo: 'prompt', required: true },
                { name: 'aspect_ratio', mapsTo: 'aspectRatio', options: [{ value: '16:9' }, { value: '9:16' }], defaultValue: '9:16' },
                { name: 'resolution', mapsTo: 'resolution', options: [{ value: '1k' }, { value: '2k' }], defaultValue: '1k' },
                { name: 'images', mapsTo: 'images', minItems: 0, maxItems: 9 },
              ],
            }],
          },
          { id: 'banana2-S_copy', name: 'banana2-S_copy', type: 'image_generation', status: 'available' },
          { id: 'gpt-image-2', name: 'gpt-image-2', type: 'image_generation', status: 'available' },
          { id: 'ph-gpt-image-2', name: 'ph-gpt-image-2', type: 'image_generation', status: 'available' },
          { id: 'ph-gpt-image-2k', name: 'ph-gpt-image-2k', type: 'image_generation', status: 'available' },
          { id: 'ph-gpt-image-4k', name: 'ph-gpt-image-4k', type: 'image_generation', status: 'available' },
          { id: 'zh-grok-video-1.0', name: 'zh-grok-video-1.0', type: 'video_generation', status: 'available' },
          { id: 'grok-imagine-video-1.5-fast', name: 'grok-imagine-video-1.5-fast', type: 'video_generation', status: 'available', tasks: [] },
          { id: 'zh-grok-video-1.5', name: 'zh-grok-video-1.5', type: 'video_generation', status: 'available' },
          { id: 'gr-banana-2', name: 'gr-banana-2', type: 'image_generation', status: 'available' },
          { id: 'gr-banana-pro', name: 'gr-banana-pro', type: 'image_generation', status: 'available' },
          {
            id: 'sdquan-2',
            name: 'sdquan-2',
            type: 'video_generation',
            status: 'available',
            pricing: { type: 'per_call', amount: 5.8, currency: 'CNY' },
            tasks: [{
              taskKind: 'video.generate',
              parameters: [
                { name: 'prompt', mapsTo: 'prompt', required: true },
                { name: 'aspect_ratio', mapsTo: 'aspectRatio', options: [{ value: '16:9' }, { value: '9:16' }], defaultValue: '9:16' },
                { name: 'images', mapsTo: 'images', minItems: 0, maxItems: 9 },
                { name: 'seconds', mapsTo: 'duration', options: [{ value: '15' }], defaultValue: '15' },
                { name: 'audios', mapsTo: 'audioUrls', minItems: 0, maxItems: 3 },
                { name: 'resolution', mapsTo: 'resolution', options: [{ value: '720p' }], defaultValue: '720p' },
              ],
            }],
          },
          { id: 'sdquan-2-miao_fast', name: 'sdquan-2-miao_fast', type: 'video_generation', status: 'available', pricing: { type: 'per_second', amount: 0.3, currency: 'CNY' } },
          { id: 'sdquan-2-miao', name: 'sdquan-2-miao', type: 'video_generation', status: 'available', pricing: { type: 'per_second', amount: 0.43, currency: 'CNY' } },
          { id: 'sdquan-fast', name: 'sdquan-fast', type: 'video_generation', status: 'available' },
          { id: 'sdquan-v3-pro', name: 'sdquan-v3-pro', type: 'video_generation', status: 'available', pricing: { type: 'per_second', amount: 0.43, currency: 'CNY' } },
          { id: 'me-kuaile1.0', name: 'me-kuaile1.0', type: 'video_generation', status: 'available' },
          { id: 'wanneng1.1', name: 'wanneng1.1', type: 'video_generation', status: 'available' },
          { id: 'B-quannengship2.0', name: 'B-quannengship2.0', type: 'video_generation', status: 'available' },
          { id: 'seedance-2.0-933', name: 'seedance-2.0-933', type: 'video_generation', status: 'available' },
          { id: 'quanneng2.0', name: 'quanneng2.0', type: 'video_generation', status: 'available' },
        ],
      },
    };
  }, async () => {
    const remote = await fetchRemoteModels({
      id: 9,
      name: 'Hongniao AI',
      provider_key: 'hongniao',
      provider_type: 'hongniao',
      api_base_url: 'https://open.hongniaoai.com/v1',
    }, 'sk_test');
    assert.equal(remote.failures.length, 0);
    assert.equal(remote.models.length, 21);
    const bananaModel = remote.models.find((model) => model.id === 'banana2-S');
    const imageModel = remote.models.find((model) => model.id === 'gpt-image-2');
    const videoModel = remote.models.find((model) => model.id === 'sdquan-2');
    assert.equal(bananaModel?.type, 'image');
    assert.deepEqual(bananaModel?.config?.supported_ratios, ['16:9', '9:16']);
    assert.deepEqual(bananaModel?.config?.supported_qualities, ['1K', '2K']);
    assert.equal(bananaModel?.config?.max_reference_images, 9);
    assert.equal(bananaModel?.config?.billing?.amount, 0.09);
    assert.equal(bananaModel?.config?.remote_parameters?.[0]?.taskKind, 'image.generate');
    assert.equal(imageModel?.type, 'image');
    assert.equal(imageModel?.config?.api_format, 'hongniao_image');
    assert.equal(imageModel?.config?.endpoints?.create, '/v1/images');
    assert.equal(imageModel?.config?.endpoints?.query, '/api/v1/images/{id}');
    assert.equal(videoModel?.type, 'video');
    assert.equal(videoModel?.config?.api_format, 'hongniao_video');
    assert.deepEqual(videoModel?.config?.param_names, ['prompt', 'aspectRatio', 'seconds', 'images', 'audioUrls', 'resolution']);
    assert.deepEqual(videoModel?.config?.supported_ratios, ['16:9', '9:16']);
    assert.deepEqual(videoModel?.config?.supported_durations, ['15s']);
    assert.deepEqual(videoModel?.config?.supported_qualities, ['720p']);
    assert.equal(videoModel?.config?.input_mode, 'reference_images');
    assert.equal(videoModel?.config?.reference_upload_mode, 'reference_images');
    assert.equal(videoModel?.config?.min_reference_images, 0);
    assert.equal(videoModel?.config?.max_reference_images, 9);
    assert.equal(videoModel?.config?.max_audio_urls, 3);
  });

  const adapter = new HongniaoAdapter();
  await withMockedHttp((call) => {
    if (call.method === 'POST') {
      assert.equal(call.url, 'https://open.hongniaoai.com/v1/videos');
      assert.equal(call.headers?.['X-API-Key'], 'sk_test');
      assert.equal(call.headers?.Authorization, undefined);
      assert.equal(call.body.model, 'sdquan-2');
      assert.equal(call.body.prompt, 'camera move');
      assert.equal(call.body.aspectRatio, '9:16');
      assert.equal(call.body.seconds, '10');
      assert.equal(call.body.resolution, '720p');
      assert.deepEqual(call.body.images, ['https://cdn.example/first.jpg']);
      assert.deepEqual(call.body.audioUrls, ['https://cdn.example/bgm.mp3']);
      assert.deepEqual(call.body.videoUrls, ['https://cdn.example/source.mp4']);
      assert.deepEqual(call.body.parameters, { motion_mode: 'fast' });
      assert.equal(call.body.parameters?.undeclared_param, undefined);
      return {
        body: JSON.stringify({
          id: 'video_1781408431394_x73wpueu_video_generation',
          object: 'video',
          model: 'sdquan-2',
          status: 'queued',
          progress: 0,
          created_at: 1781408431,
          size: '1280x720',
          seconds: '10',
        }),
      };
    }
    return {
      body: JSON.stringify({
        id: 'video_1781408431394_x73wpueu_video_generation',
        object: 'video',
        model: 'keling-3',
        status: 'completed',
        progress: 100,
        videoUrl: 'https://cdn.example/out.mp4',
      }),
    };
  }, async (calls) => {
    const submit = await adapter.submitTask({
      upstreamCode: 'sdquan-2',
      taskType: 'video_edit',
      prompt: 'camera move',
      images: ['https://cdn.example/first.jpg'],
      params: {
        ratio: '9:16',
        duration: '10s',
        resolution: '720p',
        audioUrl: 'https://cdn.example/bgm.mp3',
        videoUrl: 'https://cdn.example/source.mp4',
      },
      providerConfig: {
        baseUrl: 'https://open.hongniaoai.com/v1',
        apiKey: 'sk_test',
        timeout: 30000,
        protocolType: 'rest',
        authType: 'bearer',
      },
      modelConfig: {
        remote_parameters: [{
          taskKind: 'video.generate',
          parameters: [
            { name: 'motion_mode', defaultValue: 'fast' },
            { name: 'seed' },
          ],
        }],
        default_params: {
          motion_mode: 'fast',
          undeclared_param: 'should_not_send',
        },
      },
    });
    assert.equal(submit.type, 'async');
    assert.equal(submit.providerTaskId, 'video_1781408431394_x73wpueu_video_generation');
    assert.equal(submit.status, 'queued');

    const polled = await adapter.queryTask(submit.providerTaskId!, {
      baseUrl: 'https://open.hongniaoai.com/v1',
      apiKey: 'sk_test',
      timeout: 30000,
      authType: 'bearer',
      queryTaskUrl: '/api/v1/videos/{id}',
    });
    assert.equal(calls[1].url, 'https://open.hongniaoai.com/api/v1/videos/video_1781408431394_x73wpueu_video_generation');
    assert.equal(calls[1].headers?.['X-API-Key'], 'sk_test');
    assert.equal(adapter.mapStatus(polled.status, {}), 'completed');
    assert.equal(polled.result?.urls[0], 'https://cdn.example/out.mp4');
  });

  await withMockedHttp((call) => {
    assert.equal(call.method, call.url.includes('/videos/') ? 'GET' : 'POST');
    if (call.method === 'POST') {
      return { code: 202, data: { task: { id: 'nested_video_1', status: 'queued' } } };
    }
    return {
      data: {
        task: {
          id: 'nested_video_1',
          status: 'completed',
          output: { video_url: 'https://cdn.example/nested.mp4' },
        },
      },
    };
  }, async (calls) => {
    const submit = await adapter.submitTask({
      upstreamCode: 'sdquan-2',
      taskType: 'text_to_video',
      prompt: 'nested response',
      params: { ratio: '16:9', duration: '15s' },
      providerConfig: {
        baseUrl: 'https://open.hongniaoai.com/v1',
        apiKey: 'sk_test',
        timeout: 30000,
        protocolType: 'rest',
        authType: 'api_key',
      },
    });
    assert.equal(submit.type, 'async');
    assert.equal(submit.providerTaskId, 'nested_video_1');
    assert.equal(calls[0].body.resolution, undefined, 'missing UI quality must not become an implicit 720p parameter');

    const polled = await adapter.queryTask('nested_video_1', {
      baseUrl: 'https://open.hongniaoai.com/v1',
      apiKey: 'sk_test',
      timeout: 30000,
      authType: 'api_key',
      queryTaskUrl: '/api/v1/videos/{id}',
    });
    assert.equal(adapter.mapStatus(polled.status, {}), 'completed');
    assert.deepEqual(polled.result?.urls, ['https://cdn.example/nested.mp4']);
  });

  await withMockedHttp((call) => {
    assert.equal(call.method, 'POST');
    assert.equal(call.url, 'https://open.hongniaoai.com/v1/videos');
    assert.equal(call.body.model, 'zh-grok-video-1.5');
    assert.equal(call.body.aspectRatio, '720x1280');
    return {
      body: JSON.stringify({
        id: 'video_size_ratio_1',
        object: 'video',
        model: 'zh-grok-video-1.5',
        status: 'queued',
      }),
    };
  }, async () => {
    const submit = await adapter.submitTask({
      upstreamCode: 'zh-grok-video-1.5',
      taskType: 'image_to_video',
      prompt: 'vertical motion',
      images: ['https://cdn.example/first.jpg'],
      params: {
        ratio: '9:16',
        duration: '6s',
      },
      providerConfig: {
        baseUrl: 'https://open.hongniaoai.com/v1',
        apiKey: 'sk_test',
        timeout: 30000,
        protocolType: 'rest',
        authType: 'bearer',
      },
    });
    assert.equal(submit.type, 'async');
    assert.equal(submit.providerTaskId, 'video_size_ratio_1');
  });

  await withMockedHttp((call) => {
    assert.equal(call.method, 'POST');
    assert.equal(call.body.model, 'me-kuaile1.0');
    assert.equal(call.body.resolution, '1080P', 'Hongniao should restore the provider-declared quality casing');
    return { id: 'video_quality_case_1', status: 'queued' };
  }, async () => {
    const submit = await adapter.submitTask({
      upstreamCode: 'me-kuaile1.0',
      taskType: 'text_to_video',
      prompt: 'quality enum',
      params: { ratio: '16:9', duration: '15s', resolution: '1080p' },
      modelConfig: { supported_qualities: ['720P', '1080P'] },
      providerConfig: {
        baseUrl: 'https://open.hongniaoai.com/v1',
        apiKey: 'sk_test',
        timeout: 30000,
        protocolType: 'rest',
        authType: 'api_key',
      },
    });
    assert.equal(submit.type, 'async');
    assert.equal(submit.providerTaskId, 'video_quality_case_1');
  });

  await withMockedHttp((call) => {
    assert.equal(call.method, 'POST');
    assert.equal(call.url, 'https://open.hongniaoai.com/v1/images');
    assert.equal(call.headers?.['X-API-Key'], 'sk_test');
    assert.equal(call.headers?.Authorization, undefined);

    if (call.body.model === 'gpt-image-2') {
      assert.equal(call.body.prompt, 'product photo');
      // HongNiao gpt-image-2 format: aspect_ratio + parameters.quality (not OpenAI size/n)
      assert.equal(call.body.aspect_ratio, '16:9');
      assert.deepEqual(call.body.parameters, { quality: 'high' });
      assert.deepEqual(call.body.images, ['https://cdn.example/ref.png']);
      assert.equal(call.body.size, undefined);
      assert.equal(call.body.n, undefined);
      assert.equal(call.body.resolution, undefined);
      return {
        body: JSON.stringify({
          id: 'image_gpt_1',
          object: 'image',
          model: 'gpt-image-2',
          status: 'queued',
          progress: 0,
        }),
      };
    }

    assert.equal(call.body.model, 'gemini-3.1-flash-image-preview');
    assert.equal(call.body.prompt, 'studio portrait');
    assert.equal(call.body.aspectRatio, '9:16');
    assert.equal(call.body.imageSize, '2K');
    assert.equal(call.body.thinkingLevel, 'high');
    assert.equal(call.body.size, undefined);
    assert.equal(call.body.resolution, undefined);
    assert.deepEqual(call.body.images, ['https://cdn.example/person.png']);
    return {
      body: JSON.stringify({
        id: 'image_nano_1',
        object: 'image',
        model: 'gemini-3.1-flash-image-preview',
        status: 'queued',
        progress: 0,
      }),
    };
  }, async () => {
    const gptSubmit = await adapter.submitTask({
      upstreamCode: 'gpt-image-2',
      taskType: 'text_to_image',
      prompt: 'product photo',
      images: ['https://cdn.example/ref.png'],
      params: {
        ratio: '16:9',
        resolutionPreset: '4K',
        quality: '1K',
        imageCount: 2,
      },
      providerConfig: {
        baseUrl: 'https://open.hongniaoai.com/v1',
        apiKey: 'sk_test',
        timeout: 30000,
        protocolType: 'rest',
        authType: 'api_key',
      },
    });
    assert.equal(gptSubmit.type, 'async');
    assert.equal(gptSubmit.providerTaskId, 'image_gpt_1');

    const nanoSubmit = await adapter.submitTask({
      upstreamCode: 'gemini-3.1-flash-image-preview',
      taskType: 'image_to_image',
      prompt: 'studio portrait',
      images: ['https://cdn.example/person.png'],
      params: {
        aspectRatio: '9:16',
        resolutionPreset: '2K',
      },
      providerConfig: {
        baseUrl: 'https://open.hongniaoai.com/v1',
        apiKey: 'sk_test',
        timeout: 30000,
        protocolType: 'rest',
        authType: 'api_key',
      },
    });
    assert.equal(nanoSubmit.type, 'async');
    assert.equal(nanoSubmit.providerTaskId, 'image_nano_1');
  });

  await withMockedHttp((call) => {
    assert.equal(call.method, 'GET');
    assert.equal(call.url, 'https://open.hongniaoai.com/api/v1/images/image_gpt_1');
    assert.equal(call.headers?.['X-API-Key'], 'sk_test');
    return {
      body: JSON.stringify({
        id: 'image_gpt_1',
        object: 'image',
        model: 'gpt-image-2',
        status: 'completed',
        imageUrl: 'https://cdn.example/out.png',
      }),
    };
  }, async () => {
    const polled = await adapter.queryTask('image_gpt_1', {
      baseUrl: 'https://open.hongniaoai.com/v1',
      apiKey: 'sk_test',
      timeout: 30000,
      authType: 'api_key',
      queryTaskUrl: '/api/v1/images/{id}',
    });
    assert.equal(adapter.mapStatus(polled.status, {}), 'completed');
    assert.equal(polled.result?.urls[0], 'https://cdn.example/out.png');
  });

  await withMockedHttp((call) => {
    assert.equal(call.method, 'POST');
    assert.equal(call.body.model, 'banana2-S');
    assert.equal(call.body.aspectRatio, '16:9');
    assert.equal(call.body.resolution, '2K');
    assert.equal(call.body.size, undefined, 'Hongniao image models without size declaration must not receive native pixels');
    assert.equal(call.body.n, undefined, 'Hongniao image models without count declaration must not receive n');
    return { id: 'image_banana_1', status: 'queued' };
  }, async () => {
    const submit = await adapter.submitTask({
      upstreamCode: 'banana2-S',
      taskType: 'text_to_image',
      prompt: 'declared image fields only',
      params: {
        ratio: '16:9',
        resolutionPreset: '2K',
        nativeSize: '2048x1152',
        sizeOption: { ratio: '16:9', resolutionPreset: '2K', upstreamSize: '2048x1152' },
      },
      modelConfig: {
        param_names: ['prompt', 'aspectRatio', 'images', 'resolution'],
        supported_qualities: ['1K', '2K'],
      },
      providerConfig: {
        baseUrl: 'https://open.hongniaoai.com/v1',
        apiKey: 'sk_test',
        timeout: 30000,
        protocolType: 'rest',
        authType: 'api_key',
      },
    });
    assert.equal(submit.type, 'async');
    assert.equal(submit.providerTaskId, 'image_banana_1');
  });

  await withMockedHttp((call) => {
    assert.equal(call.method, 'POST');
    return { id: 'image_default_quality_1', status: 'queued' };
  }, async (calls) => {
    const submit = await adapter.submitTask({
      upstreamCode: 'ph-gpt-image-2',
      taskType: 'text_to_image',
      prompt: 'default quality',
      params: { ratio: '16:9', resolutionPreset: '1K' },
      modelConfig: {
        param_names: ['prompt', 'aspectRatio', 'images', 'quality'],
        supported_qualities: ['high', 'medium', 'low'],
        default_params: { quality: 'high' },
      },
      providerConfig: {
        baseUrl: 'https://open.hongniaoai.com/v1',
        apiKey: 'sk_test',
        timeout: 30000,
        protocolType: 'rest',
        authType: 'api_key',
      },
    });
    assert.equal(submit.type, 'async');
    assert.equal(calls[0].body.quality, 'high', 'declared Hongniao image default quality should be preserved');
    assert.equal(calls[0].body.resolution, undefined);
  });

  assert(AdapterRegistry.list().includes('hongniao'), 'AdapterRegistry should register hongniao provider type');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
