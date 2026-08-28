import assert from 'node:assert/strict';
import { createServer } from 'node:http';

const { OpenAICompatibleAdapter } = await import('../src/services/adapters/openai-compatible.adapter.ts');
const adapter = new OpenAICompatibleAdapter();
const requests = [];

const server = createServer((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    requests.push({
      url: request.url,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
    });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ id: `video_${requests.length}`, status: 'queued' }));
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

const base = {
  prompt: 'A cinematic transition',
  providerConfig: {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    apiKey: 'test-only',
    timeout: 1000,
    protocolType: 'rest',
    authType: 'bearer',
  },
};

try {
  await adapter.submitTask({
    ...base,
    upstreamCode: 'agnes-video-v2.0',
    taskType: 'first_last_frame_video',
    images: ['https://example.com/first.png', 'https://example.com/last.png'],
    params: { width: 864, height: 1536, durationSeconds: 5, videoMode: 'first_last' },
    modelConfig: { sync_provider_type: 'agnes_ai', endpoints: { create: '/v1/videos' } },
  });
  assert.deepEqual(requests[0].body, {
    model: 'agnes-video-v2.0',
    prompt: 'A cinematic transition',
    extra_body: {
      image: ['https://example.com/first.png', 'https://example.com/last.png'],
      mode: 'keyframes',
    },
    width: 864,
    height: 1536,
    frame_rate: 24,
    num_frames: 121,
  });

  await adapter.submitTask({
    ...base,
    upstreamCode: 'agnes-video-2.5',
    taskType: 'video',
    params: {
      duration: 5,
      ratio: '16:9',
      videoMode: 'reference',
      videoUrls: ['https://example.com/reference.mp4'],
    },
    modelConfig: {
      sync_provider_type: 'agnes_ai',
      unsupported_inputs: [],
      supported_sizes: ['720P'],
      endpoints: { create: '/v1/videos' },
    },
  });
  assert.deepEqual(requests[1].body.videos, [{ url: 'https://example.com/reference.mp4' }]);
  assert.equal(requests[1].body.mode, 'reference');
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log('[agnes-adapter-request] PASS');
