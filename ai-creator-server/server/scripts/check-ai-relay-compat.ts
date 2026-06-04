import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { OpenAICompatibleAdapter } from '../src/services/adapters/openai-compatible.adapter';
import { RelayAdapter } from '../src/services/adapters/relay.adapter';
import { WellAPIAdapter } from '../src/services/adapters/wellapi.adapter';
import { ApimartAdapter } from '../src/services/adapters/apimart.adapter';
import { joinBasePath } from '../src/services/adapters/adapter.interface';

type AxiosPost = typeof axios.post;
type AxiosGet = typeof axios.get;

interface CapturedCall {
  method: 'POST' | 'GET';
  url: string;
  body?: any;
}

const originalPost: AxiosPost = axios.post.bind(axios);
const originalGet: AxiosGet = axios.get.bind(axios);
const calls: CapturedCall[] = [];

function assert(condition: any, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(label: string, actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function installAxiosMock(options: {
  post?: (url: string, body: any) => any;
  get?: (url: string) => any;
}): void {
  calls.length = 0;
  (axios as any).post = async (url: string, body: any) => {
    calls.push({ method: 'POST', url, body });
    if (!options.post) throw new Error(`Unexpected POST ${url}`);
    return { data: options.post(url, body) };
  };
  (axios as any).get = async (url: string) => {
    calls.push({ method: 'GET', url });
    if (!options.get) throw new Error(`Unexpected GET ${url}`);
    return { data: options.get(url) };
  };
}

function restoreAxios(): void {
  (axios as any).post = originalPost;
  (axios as any).get = originalGet;
}

function baseProviderConfig(baseUrl = 'https://relay.example/v1') {
  return {
    baseUrl,
    apiKey: 'check-key',
    timeout: 1000,
    protocolType: 'rest',
    authType: 'bearer',
  };
}

async function checkOpenAICompatibleUrlResult(): Promise<void> {
  const adapter = new OpenAICompatibleAdapter();
  installAxiosMock({
    post: () => ({ data: [{ url: 'https://cdn.example/image.png', revised_prompt: 'revised' }] }),
  });
  try {
    const result = await adapter.submitTask({
      upstreamCode: 'image-model',
      taskType: 'text_to_image',
      prompt: 'image prompt',
      images: [],
      params: { imageCount: 1, nativeSize: '1024x1024' },
      providerConfig: baseProviderConfig('https://relay.example/v1'),
    });
    assertEqual('openai compatible sync type', result.type, 'sync');
    assertEqual('openai compatible url', result.result?.urls[0], 'https://cdn.example/image.png');
    assert(!calls[0].url.includes('/v1/v1/'), 'openai compatible base URL duplicated /v1');
  } finally {
    restoreAxios();
  }
}

async function checkOpenAICompatibleBase64Result(): Promise<void> {
  const adapter = new OpenAICompatibleAdapter();
  const b64 = Buffer.from('fake-image').toString('base64');
  installAxiosMock({
    post: () => ({ output: { images: [{ b64_json: b64 }, { b64_json: '' }] } }),
  });
  try {
    const result = await adapter.submitTask({
      upstreamCode: 'image-model',
      taskType: 'text_to_image',
      prompt: 'base64 prompt',
      images: [],
      params: { imageCount: 1 },
      providerConfig: baseProviderConfig(),
    });
    assertEqual('openai compatible b64 count', result.result?.urls.length, 1);
    assertEqual('openai compatible b64 value', result.result?.urls[0], b64);
  } finally {
    restoreAxios();
  }
}

async function checkRelaySyncUrls(): Promise<void> {
  const adapter = new RelayAdapter();
  installAxiosMock({
    post: () => ({ status: 'success', result: { urls: ['https://cdn.example/relay.png', ''] } }),
  });
  try {
    const result = await adapter.submitTask({
      upstreamCode: 'relay-image',
      taskType: 'text_to_image',
      prompt: 'relay prompt',
      images: [],
      params: {},
      providerConfig: baseProviderConfig('https://relay.example'),
    });
    assertEqual('relay sync type', result.type, 'sync');
    assertEqual('relay sync urls count', result.result?.urls.length, 1);
    assertEqual('relay sync url', result.result?.urls[0], 'https://cdn.example/relay.png');
  } finally {
    restoreAxios();
  }
}

async function checkRelayAsyncImagePolling(): Promise<void> {
  const adapter = new RelayAdapter();
  installAxiosMock({
    post: () => ({ task_id: 'img-task-1', status: 'processing' }),
    get: () => ({ status: 'completed', result: { data: [{ image_url: 'https://cdn.example/async-image.png' }] } }),
  });
  try {
    const submit = await adapter.submitTask({
      upstreamCode: 'relay-image-async',
      taskType: 'text_to_image',
      prompt: 'async image prompt',
      images: [],
      params: {},
      providerConfig: baseProviderConfig(),
    });
    assertEqual('relay async image submit type', submit.type, 'async');
    assertEqual('relay async image provider task id', submit.providerTaskId, 'img-task-1');
    const polled = await adapter.queryTask('img-task-1', {
      baseUrl: 'https://relay.example/v1',
      apiKey: 'check-key',
      timeout: 1000,
      authType: 'bearer',
    });
    assertEqual('relay async image poll status', adapter.mapStatus(polled.status, {}), 'completed');
    assertEqual('relay async image result', polled.result?.urls[0], 'https://cdn.example/async-image.png');
  } finally {
    restoreAxios();
  }
}

async function checkImageReferenceImagesPassed(): Promise<void> {
  const adapter = new RelayAdapter();
  installAxiosMock({
    post: (_url, body) => {
      assertEqual('reference image count', body.images?.length, 1);
      assertEqual('reference image url', body.images[0], 'https://cdn.example/ref.png');
      return { status: 'success', result: { url: 'https://cdn.example/out.png' } };
    },
  });
  try {
    await adapter.submitTask({
      upstreamCode: 'relay-img2img',
      taskType: 'image_to_image',
      prompt: 'img2img prompt',
      images: ['https://cdn.example/ref.png'],
      params: {},
      providerConfig: baseProviderConfig(),
    });
  } finally {
    restoreAxios();
  }

  const taskServicePath = path.resolve(__dirname, '../src/services/task.service.ts');
  const taskService = fs.readFileSync(taskServicePath, 'utf8');
  assert(taskService.includes('uploadKeys: imageReferences.urls'), 'createImageTask does not enqueue resolved uploadKeys');
  assert(taskService.includes('images: input.uploadKeys || []'), 'processTask does not pass uploadKeys into adapter images');
}

async function checkVideoAsyncStillSupported(): Promise<void> {
  const adapter = new RelayAdapter();
  installAxiosMock({
    post: () => ({ task_id: 'video-task-1', status: 'queued' }),
    get: () => ({ status: 'succeeded', output: { video_url: 'https://cdn.example/video.mp4' } }),
  });
  try {
    const submit = await adapter.submitTask({
      upstreamCode: 'relay-video-async',
      taskType: 'text_to_video',
      prompt: 'video prompt',
      images: [],
      params: { duration: '5s', ratio: '9:16' },
      providerConfig: baseProviderConfig(),
    });
    assertEqual('relay async video submit type', submit.type, 'async');
    const polled = await adapter.queryTask('video-task-1', {
      baseUrl: 'https://relay.example/v1',
      apiKey: 'check-key',
      timeout: 1000,
      authType: 'bearer',
    });
    assertEqual('relay async video status mapping', adapter.mapStatus(polled.status, {}), 'completed');
    assertEqual('relay async video result', polled.result?.urls[0], 'https://cdn.example/video.mp4');
  } finally {
    restoreAxios();
  }

  const pollingPath = path.resolve(__dirname, '../src/services/video-polling.service.ts');
  const polling = fs.readFileSync(pollingPath, 'utf8');
  assert(polling.includes("task_type IN ('image', 'video')"), 'provider polling is not scanning both image and video tasks');
  assert(polling.includes("task.task_type === 'video' ? 'video' : 'image'"), 'provider polling is not saving outputs by task type');
}

async function checkWellAPIImageGeneration(): Promise<void> {
  const adapter = new WellAPIAdapter();
  installAxiosMock({
    post: (_url, body) => {
      assertEqual('wellapi image model', body.model, 'qwen-image-2.0');
      assertEqual('wellapi image count', body.n, 1);
      assertEqual('wellapi image size', body.size, '1024x1024');
      assertEqual('wellapi image response format', body.response_format, 'url');
      assert(!('duration' in body), 'wellapi image request should not include video duration');
      return { data: [{ url: 'https://cdn.example/wellapi-image.png' }] };
    },
  });
  try {
    const result = await adapter.submitTask({
      upstreamCode: 'qwen-image-2.0',
      taskType: 'text_to_image',
      prompt: 'wellapi image prompt',
      images: [],
      params: { imageCount: 1, nativeSize: '1024x1024', quality: 'standard' },
      providerConfig: baseProviderConfig('https://wellapi.ai'),
    });
    assertEqual('wellapi image endpoint', calls[0].url, 'https://wellapi.ai/v1/images/generations');
    assertEqual('wellapi image sync type', result.type, 'sync');
    assertEqual('wellapi image url', result.result?.urls[0], 'https://cdn.example/wellapi-image.png');
  } finally {
    restoreAxios();
  }
}

async function checkApimartImageAsyncSubmit(): Promise<void> {
  const adapter = new ApimartAdapter();
  installAxiosMock({
    post: (_url, body) => {
      assertEqual('apimart image model', body.model, 'gpt-image-2');
      assertEqual('apimart image count', body.n, 1);
      assertEqual('apimart image ratio size', body.size, '16:9');
      assertEqual('apimart image resolution', body.resolution, '2k');
      assertEqual('apimart image refs count', body.image_urls?.length, 1);
      assertEqual('apimart image ref url', body.image_urls[0], 'https://cdn.example/ref.png');
      return { code: 200, data: [{ status: 'submitted', task_id: 'apimart-img-task-1' }] };
    },
  });
  try {
    const result = await adapter.submitTask({
      upstreamCode: 'gpt-image-2',
      taskType: 'image_to_image',
      prompt: 'apimart image prompt',
      images: ['https://cdn.example/ref.png'],
      params: { imageCount: 1, ratio: '16:9', nativeSize: '1024x1024', resolution: '2K' },
      providerConfig: baseProviderConfig('https://api.apimart.ai/v1'),
    });
    assertEqual('apimart image endpoint', calls[0].url, 'https://api.apimart.ai/v1/images/generations');
    assertEqual('apimart image submit type', result.type, 'async');
    assertEqual('apimart image provider task id', result.providerTaskId, 'apimart-img-task-1');
  } finally {
    restoreAxios();
  }
}

async function checkApimartVideoAsyncSubmit(): Promise<void> {
  const adapter = new ApimartAdapter();
  installAxiosMock({
    post: (_url, body) => {
      assertEqual('apimart video model', body.model, 'pixverse-v6');
      assertEqual('apimart video size', body.size, '9:16');
      assertEqual('apimart video duration', body.duration, 5);
      assertEqual('apimart video first frame', body.first_frame_image, 'https://cdn.example/first.png');
      assertEqual('apimart video last frame', body.last_frame_image, 'https://cdn.example/last.png');
      return { code: 200, data: [{ status: 'submitted', task_id: 'apimart-video-task-1' }] };
    },
  });
  try {
    const result = await adapter.submitTask({
      upstreamCode: 'pixverse-v6',
      taskType: 'first_last_frame_video',
      prompt: 'apimart video prompt',
      images: ['https://cdn.example/first.png', 'https://cdn.example/last.png'],
      params: { duration: '5s', ratio: '9:16' },
      providerConfig: baseProviderConfig('https://api.apimart.ai'),
    });
    assertEqual('apimart video endpoint', calls[0].url, 'https://api.apimart.ai/v1/videos/generations');
    assertEqual('apimart video submit type', result.type, 'async');
    assertEqual('apimart video provider task id', result.providerTaskId, 'apimart-video-task-1');
  } finally {
    restoreAxios();
  }
}

async function checkApimartPollingResults(): Promise<void> {
  const adapter = new ApimartAdapter();
  installAxiosMock({
    get: url => {
      if (url.endsWith('/apimart-img-task-1')) {
        return {
          code: 200,
          data: {
            id: 'apimart-img-task-1',
            status: 'completed',
            cost: 0.15,
            result: { images: [{ url: ['https://upload.apimart.ai/f/image/out.png'] }] },
          },
        };
      }
      if (url.endsWith('/apimart-video-task-1')) {
        return {
          code: 200,
          data: {
            id: 'apimart-video-task-1',
            status: 'completed',
            result: { videos: [{ url: ['https://upload.apimart.ai/f/video/out.mp4'] }] },
          },
        };
      }
      throw new Error(`Unexpected APIMart poll URL ${url}`);
    },
  });
  try {
    const image = await adapter.queryTask('apimart-img-task-1', {
      baseUrl: 'https://api.apimart.ai/v1',
      apiKey: 'check-key',
      timeout: 1000,
      authType: 'bearer',
    });
    assertEqual('apimart image poll endpoint', calls[0].url, 'https://api.apimart.ai/v1/tasks/apimart-img-task-1');
    assertEqual('apimart image poll status', adapter.mapStatus(image.status, {}), 'completed');
    assertEqual('apimart image poll url', image.result?.urls[0], 'https://upload.apimart.ai/f/image/out.png');
    assertEqual('apimart image poll cost', image.cost?.apiRawCost, 0.15);

    const video = await adapter.queryTask('apimart-video-task-1', {
      baseUrl: 'https://api.apimart.ai',
      apiKey: 'check-key',
      timeout: 1000,
      authType: 'bearer',
    });
    assertEqual('apimart video poll endpoint', calls[1].url, 'https://api.apimart.ai/v1/tasks/apimart-video-task-1');
    assertEqual('apimart video poll status', adapter.mapStatus(video.status, {}), 'completed');
    assertEqual('apimart video poll url', video.result?.urls[0], 'https://upload.apimart.ai/f/video/out.mp4');
  } finally {
    restoreAxios();
  }
}

async function checkApimartFailedPolling(): Promise<void> {
  const adapter = new ApimartAdapter();
  installAxiosMock({
    get: () => ({
      code: 200,
      data: {
        id: 'apimart-failed-task',
        status: 'failed',
        error: { code: 'task_failed', message: 'moderation failed' },
      },
    }),
  });
  try {
    const result = await adapter.queryTask('apimart-failed-task', {
      baseUrl: 'https://api.apimart.ai/v1',
      apiKey: 'check-key',
      timeout: 1000,
      authType: 'bearer',
    });
    assertEqual('apimart failed poll status', adapter.mapStatus(result.status, {}), 'failed');
    assertEqual('apimart failed poll reason', result.error?.message, 'moderation failed');
  } finally {
    restoreAxios();
  }
}

async function checkApimartJsonCodeError(): Promise<void> {
  const adapter = new ApimartAdapter();
  installAxiosMock({
    post: () => ({ code: 401, message: 'invalid api key' }),
  });
  try {
    const result = await adapter.submitTask({
      upstreamCode: 'gpt-image-2',
      taskType: 'text_to_image',
      prompt: 'apimart auth prompt',
      images: [],
      params: {},
      providerConfig: baseProviderConfig('https://api.apimart.ai/v1'),
    });
    assertEqual('apimart json error type', result.type, 'sync');
    assertEqual('apimart json error status', result.status, 'failed');
    assertEqual('apimart json error message', result.error?.message, 'APIMart 鉴权失败，请检查 API Key');
  } finally {
    restoreAxios();
  }
}

function checkBaseUrlJoin(): void {
  assertEqual('join base root', joinBasePath('https://domain.com', '/v1/images/generations'), 'https://domain.com/v1/images/generations');
  assertEqual('join base v1', joinBasePath('https://domain.com/v1', '/images/generations'), 'https://domain.com/v1/images/generations');
  assertEqual('join base v1 slash', joinBasePath('https://domain.com/v1/', '/images/generations'), 'https://domain.com/v1/images/generations');
  assertEqual('join avoid duplicate v1', joinBasePath('https://domain.com/v1', '/v1/images/generations'), 'https://domain.com/v1/images/generations');
}

async function main(): Promise<void> {
  checkBaseUrlJoin();
  await checkOpenAICompatibleUrlResult();
  await checkOpenAICompatibleBase64Result();
  await checkRelaySyncUrls();
  await checkRelayAsyncImagePolling();
  await checkImageReferenceImagesPassed();
  await checkVideoAsyncStillSupported();
  await checkWellAPIImageGeneration();
  await checkApimartImageAsyncSubmit();
  await checkApimartVideoAsyncSubmit();
  await checkApimartPollingResults();
  await checkApimartFailedPolling();
  await checkApimartJsonCodeError();
  console.log('check:ai-relay-compat passed');
}

main().catch(err => {
  restoreAxios();
  console.error('check:ai-relay-compat failed:', err.message || err);
  process.exit(1);
});
