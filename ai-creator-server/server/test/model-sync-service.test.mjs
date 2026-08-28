import assert from 'node:assert/strict';

const service = await import('../src/services/model-sync.service.ts');

assert.equal(service.inferMediaParamMaxItems({ description: '上传1～10张参考图片' }), 10);
assert.equal(service.inferMediaParamMaxItems({ description: '最多14张图片' }), 14);
assert.equal(service.inferMediaParamMaxItems({ description: 'Upload 1-9 images' }), 9);
assert.equal(service.inferMediaParamMaxItems({ maxItems: 5, description: '最多10张图片' }), 5);
assert.equal(service.inferMediaParamMaxItems({ description: '宽高比介于1:2.5～2.5:1之间' }), undefined);
assert.equal(service.inferMediaParamMaxItems({ description: '音频时长2-300秒' }), undefined);

const existingRows = [
  {
    id: 7,
    provider_id: 3,
    name: 'Old GPT Image 2',
    display_name: '运营手工名称',
    model_type: 'unknown',
    api_model_name: 'gpt-image-2',
    upstream_model_code: 'gpt-image-2',
    query_task_url: '',
    config: JSON.stringify({ source: 'manual', supported_ratios: ['1:1'] }),
    points_cost: 99,
    status: 'inactive',
  },
  {
    id: 8,
    provider_id: 3,
    name: 'Obsolete Relay Model',
    display_name: 'Obsolete Relay Model',
    model_type: 'video',
    api_model_name: 'obsolete-video',
    upstream_model_code: 'obsolete-video',
    query_task_url: '/old/query',
    config: JSON.stringify({ source: 'manual', sync_provider_type: 'xiaoma' }),
    points_cost: 12,
    api_cost_cents: 34,
    status: 'active',
  },
];

const remoteModels = [
  {
    id: 'gpt-image-2',
    name: 'GPT Image 2',
    type: 'image',
    config: {
      source: 'xiaoma_admin_sync',
      supported_ratios: ['1:1', '16:9'],
      supported_qualities: ['1K', '2K', '4K'],
      endpoints: {
        create: '/v1/media/generate',
        query: '/v1/skills/task-status?task_id={task_id}',
      },
    },
  },
  {
    id: 'kling-video-v1',
    name: 'Kling Video V1',
    type: 'video',
    config: { source: 'xiaoma_admin_sync', supported_durations: [5, 10] },
  },
];

const preview = service.buildModelSyncPreview({
  providerId: 3,
  providerName: '小马 AI',
  existingRows,
  remoteModels,
});

assert.equal(preview.totalRemote, 2);
assert.equal(preview.additions.length, 1);
assert.equal(preview.updates.length, 1);
assert.equal(preview.skipped.length, 0);
assert.equal(preview.removals.length, 1);
assert.equal(preview.removals[0].modelId, 8);
assert.equal(preview.removals[0].apiModelName, 'obsolete-video');
assert.equal(preview.updates[0].modelId, 7);
assert.deepEqual(
  preview.updates[0].fields.map((field) => field.key).sort(),
  ['config', 'model_type', 'query_task_url'],
);
assert.equal(preview.updates[0].before.modelType, 'unknown');
assert.equal(preview.updates[0].after.modelType, 'image');

const incompletePreview = service.buildModelSyncPreview({
  providerId: 3,
  providerName: '小马 AI',
  existingRows,
  remoteModels: [],
  catalogComplete: false,
  removalPolicy: 'delete',
});
assert.equal(incompletePreview.removalBlocked, true);
assert.equal(incompletePreview.removals.length, 0);

const updatePatch = service.buildExistingModelUpdatePatch(preview.updates[0]);
assert.deepEqual(Object.keys(updatePatch).sort(), ['config', 'model_type', 'query_task_url']);
assert.equal(updatePatch.model_type, 'image');
assert.equal(updatePatch.query_task_url, '/v1/skills/task-status?task_id={task_id}');
assert.equal(JSON.parse(updatePatch.config).supported_ratios.includes('16:9'), true);
assert.equal(Object.hasOwn(updatePatch, 'points_cost'), false);
assert.equal(Object.hasOwn(updatePatch, 'status'), false);
assert.equal(Object.hasOwn(updatePatch, 'display_name'), false);

const hongniaoExistingPreview = service.buildModelSyncPreview({
  providerId: 9,
  providerName: 'Hongniao AI',
  existingRows: [{
    id: 17,
    provider_id: 9,
    name: 'Hongniao GPT Image 2',
    display_name: '运营售价保留模型',
    model_type: 'image',
    api_model_name: 'gpt-image-2',
    upstream_model_code: 'gpt-image-2',
    query_task_url: '/api/v1/images/{id}',
    config: JSON.stringify({
      sync_provider_type: 'hongniao',
      supported_ratios: ['1:1'],
      billing: { type: 'per_call', amount: 0.01, currency: 'CNY' },
    }),
    points_cost: 99,
    api_cost_cents: 1,
    status: 'active',
  }],
  remoteModels: [{
    id: 'gpt-image-2',
    name: 'GPT Image 2',
    type: 'image',
    config: {
      sync_provider_type: 'hongniao',
      api_format: 'hongniao_image',
      billing: { type: 'per_call', amount: 0.06, currency: 'CNY' },
      supported_ratios: ['auto', '1:1', '16:9'],
      remote_parameters: [{ taskKind: 'image.generate', parameters: [{ name: 'quality', options: ['high'] }] }],
      endpoints: { create: '/v1/images', query: '/api/v1/images/{id}' },
    },
  }],
});
assert.equal(hongniaoExistingPreview.updates.length, 1);
assert.equal(hongniaoExistingPreview.updates[0].fields.some((field) => field.key === 'api_cost_cents'), true);
const hongniaoUpdatePatch = service.buildExistingModelUpdatePatch(hongniaoExistingPreview.updates[0]);
assert.equal(hongniaoUpdatePatch.api_cost_cents, 6);
assert.equal(JSON.parse(hongniaoUpdatePatch.config).remote_parameters.length, 1);
assert.equal(Object.hasOwn(hongniaoUpdatePatch, 'points_cost'), false);

const hongniaoPreview = service.buildModelSyncPreview({
  providerId: 9,
  providerName: 'Hongniao AI',
  existingRows: [],
  remoteModels: [{
    id: 'sdquan-2',
    name: 'SDQuan 2',
    type: 'video',
    config: {
      api_format: 'hongniao_video',
      billing: { type: 'per_call', amount: 5.8, currency: 'CNY' },
      supported_durations: ['15s'],
      supported_qualities: ['720p'],
      default_params: { seconds: '15', resolution: '720p' },
      endpoints: { create: '/v1/videos', query: '/api/v1/videos/{id}' },
    },
  }],
});
assert.equal(hongniaoPreview.additions[0].pointsCost, 58);
assert.equal(hongniaoPreview.additions[0].apiCostCents, 580);

const hongniaoSeed = service.generateHongniaoSeedMigration({
  models: hongniaoPreview.additions.map((item) => ({
    id: item.apiModelName,
    name: item.name,
    type: item.modelType,
    config: item.config,
  })),
  checkedAt: '2026-06-19',
});
assert.match(hongniaoSeed, /'sdquan-2'.*?, 58, 580, 8800,/s);
assert.match(hongniaoSeed, /hard-delete/i);
assert.doesNotMatch(hongniaoSeed, /soft-disable|inactive/i);

const textPreview = service.buildModelSyncPreview({
  providerId: 4,
  providerName: 'OpenAI Compatible',
  existingRows: [],
  remoteModels: [{ id: 'gpt-4.1', name: 'gpt-4.1' }],
});
assert.equal(textPreview.additions[0].modelType, 'text');
assert.equal(textPreview.additions[0].queryTaskUrl, '');
assert.equal(Object.hasOwn(textPreview.additions[0].config, 'endpoints'), false);
assert.deepEqual(textPreview.additions[0].config.capabilities, ['text_generation']);

console.log('[model-sync-service] PASS');
