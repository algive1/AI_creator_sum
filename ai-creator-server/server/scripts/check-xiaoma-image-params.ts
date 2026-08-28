import assert from 'node:assert/strict';
import axios from 'axios';
import { XiaomaAdapter } from '../src/services/adapters/xiaoma.adapter';

const originalPost = axios.post.bind(axios);

async function main(): Promise<void> {
  const adapter = new XiaomaAdapter();
  let submittedBody: any = null;
  (axios as any).post = async (_url: string, body: any) => {
    submittedBody = body;
    if (body?.model === 'nested-failure') {
      return {
        data: {
          code: 0,
          data: {
            task: {
              task_id: 'xiaoma-failed-task-1',
              status: 'failed',
              message: 'provider rejected parameters',
            },
          },
        },
      };
    }
    return {
      data: {
        code: 200,
        data: {
          task_id: 'xiaoma-image-task-1',
          status: 'queued',
        },
      },
    };
  };

  try {
    await adapter.submitTask({
      upstreamCode: 'seedream-image-test',
      taskType: 'text_to_image',
      prompt: 'product poster',
      images: [],
      params: {
        ratio: '3:4',
        resolution: '2K',
        imageCount: 1,
      },
      providerConfig: {
        baseUrl: 'https://xiaoma.example',
        apiKey: 'check-key',
        timeout: 1000,
        protocolType: 'rest',
        authType: 'bearer',
      },
    });

    assert.equal(submittedBody?.model, 'seedream-image-test');
    assert.equal(submittedBody?.params?.aspect_ratio, '3:4');
    assert.equal(submittedBody?.params?.resolution, '2K');

  const sizeParams = await adapter.submitTask({
    upstreamCode: 'size-image-test',
    taskType: 'text_to_image',
    prompt: 'wide banner',
    images: [],
    params: {
      ratio: '16:9',
      resolutionPreset: '1K',
      sizeOption: { ratio: '16:9', resolutionPreset: '1K', upstreamSize: '1536x864' },
    },
    modelConfig: {
      param_names: ['prompt', 'size', 'aspect_ratio'],
    },
    providerConfig: {
      baseUrl: 'https://xiaoma.example',
      apiKey: 'check-key',
      timeout: 1000,
      protocolType: 'rest',
      authType: 'bearer',
    },
  });
  assert.equal(sizeParams.type, 'async');
  assert.equal(submittedBody?.params?.size, '1536x864');
  assert.equal(submittedBody?.params?.resolution, undefined);

  const undeclaredStandardFields = await adapter.submitTask({
    upstreamCode: 'vidu-image-2',
    taskType: 'text_to_image',
    prompt: 'declared image fields only',
    images: [],
    params: {
      ratio: '16:9',
      resolutionPreset: '2K',
      sizeOption: { ratio: '16:9', resolutionPreset: '2K', upstreamSize: '2048x1152' },
      imageCount: 2,
    },
    modelConfig: {
      param_names: ['prompt', 'images', 'aspect_ratio', 'resolution'],
    },
    providerConfig: {
      baseUrl: 'https://xiaoma.example',
      apiKey: 'check-key',
      timeout: 1000,
      protocolType: 'rest',
      authType: 'bearer',
    },
  });
  assert.equal(undeclaredStandardFields.type, 'async');
  assert.equal(submittedBody?.params?.size, undefined);
  assert.equal(submittedBody?.params?.n, undefined);
  assert.equal(submittedBody?.params?.aspect_ratio, '16:9');
  assert.equal(submittedBody?.params?.resolution, '2K');

    const failed = await new XiaomaAdapter().submitTask({
      upstreamCode: 'nested-failure',
      taskType: 'text_to_video',
      prompt: 'nested failure status',
      params: {},
      providerConfig: {
        baseUrl: 'https://xiaoma.example',
        apiKey: 'check-key',
        timeout: 1000,
        protocolType: 'rest',
        authType: 'bearer',
      },
    });
    assert.equal(failed.type, 'sync');
    assert.equal(failed.status, 'failed');
    assert.equal(failed.error?.message, 'provider rejected parameters');
  } finally {
    (axios as any).post = originalPost;
  }

  console.log('check:xiaoma-image-params passed');
}

main().catch((err) => {
  (axios as any).post = originalPost;
  console.error('check:xiaoma-image-params failed:', err?.message || err);
  process.exit(1);
});
