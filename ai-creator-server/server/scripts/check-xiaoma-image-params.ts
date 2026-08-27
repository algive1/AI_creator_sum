import assert from 'node:assert/strict';
import axios from 'axios';
import { XiaomaAdapter } from '../src/services/adapters/xiaoma.adapter';

const originalPost = axios.post.bind(axios);

async function main(): Promise<void> {
  const adapter = new XiaomaAdapter();
  let submittedBody: any = null;
  (axios as any).post = async (_url: string, body: any) => {
    submittedBody = body;
    return {
      data: {
        task_id: 'xiaoma-image-task-1',
        status: 'queued',
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
