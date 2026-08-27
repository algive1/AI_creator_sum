import test from 'node:test';
import assert from 'node:assert/strict';

const { buildXiaomaMediaParams } = await import('../src/services/adapters/xiaoma.adapter.ts');

test('xiaoma adapter applies synced remote media parameter names to its request body', () => {
  const params = buildXiaomaMediaParams({
    upstreamCode: 'wan2.6-cankaosheng',
    taskType: 'image_to_video',
    prompt: 'animate the reference',
    images: ['https://cdn.example.com/reference.png'],
    params: { duration: '5s', ratio: '16:9' },
    modelConfig: {
      remote_parameters: [
        { name: 'prompt', required: true },
        { name: 'reference_urls', type: 'array', maxItems: 4, required: true },
        { name: 'duration', required: true },
        { name: 'aspect_ratio' },
      ],
    },
    providerConfig: {
      baseUrl: 'https://xiaoma.example',
      apiKey: 'test-key',
      timeout: 1000,
      protocolType: 'rest',
      authType: 'bearer',
    },
  });

  assert.deepEqual(params.reference_urls, ['https://cdn.example.com/reference.png']);
  assert.equal(params.images, undefined);
  assert.equal(params.duration, '5');
  assert.equal(params.aspect_ratio, '16:9');
});
