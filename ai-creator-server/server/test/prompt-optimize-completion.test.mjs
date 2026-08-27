import test from 'node:test';
import assert from 'node:assert/strict';

const {
  buildDefaultPromptOptimizeSystemPrompt,
  buildPromptOptimizeModelInput,
  normalizePromptOptimizeContext,
} = await import('../src/services/ai-feature.service.ts');

const {
  clearSystemPromptCache,
  resolveSystemPromptByFeatureWithCache,
} = await import('../src/services/system-prompt.service.ts');

test('default prompt optimization instructions require deep completion without changing intent', () => {
  const prompt = buildDefaultPromptOptimizeSystemPrompt();

  assert.match(prompt, /深度补全/);
  assert.match(prompt, /保留用户原始主体/);
  assert.match(prompt, /完整但克制/);
  assert.match(prompt, /生图/);
  assert.match(prompt, /生视频/);
  assert.match(prompt, /optimized_prompt/);
});

test('prompt optimize model input preserves original prompt and frontend context', () => {
  const payload = buildPromptOptimizeModelInput('cyberpunk girl', {
    userId: 7,
    prompt: 'cyberpunk girl',
    scene: 'image_create',
    style: 'realistic',
    ratio: '9:16',
    usage: 'deep_completion',
    negativePrompt: 'blur',
    context: {
      feature: 'image',
      mode: 'text_to_image',
      hasReferenceImage: false,
      tierName: 'fast tier',
    },
  });

  const parsed = JSON.parse(payload);

  assert.equal(parsed.original_prompt, 'cyberpunk girl');
  assert.equal(parsed.usage, 'deep_completion');
  assert.equal(parsed.context.mode, 'text_to_image');
  assert.equal(parsed.context.tierName, 'fast tier');
});

test('prompt optimize model input keeps useful context and removes asset identifiers', () => {
  const payload = buildPromptOptimizeModelInput('product poster', {
    userId: 7,
    prompt: 'product poster',
    scene: 'image_create',
    context: {
      feature: 'video',
      mode: 'image_to_video',
      ratio: '9:16',
      duration: '5s',
      resolution: '720p',
      audioMode: 'silent',
      tierName: 'fast tier',
      inputAssets: [
        {
          mediaType: 'image',
          path: 'C:/tmp/a.png',
          url: 'https://cdn.example.com/a.png',
          fileId: 123,
          fileNo: 'F123',
        },
      ],
    },
  });

  const parsed = JSON.parse(payload);

  assert.equal(parsed.context.mode, 'image_to_video');
  assert.equal(parsed.context.ratio, '9:16');
  assert.equal(parsed.context.hasReferenceImage, true);
  assert.equal(parsed.context.inputAssets, undefined);
  assert.equal(JSON.stringify(parsed.context).includes('cdn.example.com'), false);
  assert.equal(JSON.stringify(parsed.context).includes('C:/tmp'), false);
  assert.equal(JSON.stringify(parsed.context).includes('F123'), false);
});

test('normalize prompt context summarizes media types without result caching', () => {
  const context = normalizePromptOptimizeContext({
    inputAssets: [
      { mediaType: 'image', url: 'https://cdn.example.com/ref.png', fileId: 1 },
      { mediaType: 'video', url: 'https://cdn.example.com/ref.mp4', fileNo: 'V1' },
      { mediaType: 'audio', path: 'C:/tmp/ref.mp3' },
    ],
  });

  assert.equal(context.hasReferenceImage, true);
  assert.equal(context.hasReferenceVideo, true);
  assert.equal(context.hasReferenceAudio, true);
  assert.equal(context.referenceImageCount, 1);
  assert.equal(context.referenceVideoCount, 1);
  assert.equal(context.referenceAudioCount, 1);
  assert.equal(JSON.stringify(context).includes('https://'), false);
  assert.equal(JSON.stringify(context).includes('fileId'), false);
});

test('system prompt cache reuses loader within ttl and can be cleared', async () => {
  clearSystemPromptCache();
  let calls = 0;
  const loader = async () => {
    calls += 1;
    return [
      { prompt_type: 'system', content: `system-${calls}` },
      { prompt_type: 'safety', content: `safety-${calls}` },
    ];
  };

  const first = await resolveSystemPromptByFeatureWithCache('prompt_optimize', loader, 1000);
  const second = await resolveSystemPromptByFeatureWithCache('prompt_optimize', loader, 1001);

  assert.equal(first, 'system-1\n\nsafety-1');
  assert.equal(second, first);
  assert.equal(calls, 1);

  clearSystemPromptCache('prompt_optimize');
  const third = await resolveSystemPromptByFeatureWithCache('prompt_optimize', loader, 1002);

  assert.equal(third, 'system-2\n\nsafety-2');
  assert.equal(calls, 2);
});
