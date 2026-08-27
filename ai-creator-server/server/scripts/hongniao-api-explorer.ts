/**
 * HongNiao AI API Explorer
 *
 * Standalone script to explore the HongNiao AI API.
 * Tests connectivity, lists all models with full parameter specs, pricing.
 * Can also test video/image creation.
 *
 * Usage:
 *   npx tsx scripts/hongniao-api-explorer.ts
 *   npx tsx scripts/hongniao-api-explorer.ts --api-key=sk_xxx
 *   npx tsx scripts/hongniao-api-explorer.ts --model=sdquan-2 --prompt="test" --aspect-ratio=9:16 --seconds=15
 *   npx tsx scripts/hongniao-api-explorer.ts --output=models-snapshot.json
 *
 * Environment variables:
 *   HONGNIAO_API_KEY - API key (overrides --api-key)
 *   HONGNIAO_BASE_URL - Base URL (default: https://open.hongniaoai.com)
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';

// ── Config ──────────────────────────────────────────────────────────
const DEFAULT_BASE_URL = 'https://open.hongniaoai.com';

interface CliConfig {
  apiKey: string;
  baseUrl: string;
  createModel?: string;
  createPrompt?: string;
  aspectRatio?: string;
  seconds?: string;
  images?: string[];
  audioUrls?: string[];
  videoUrls?: string[];
  outputFile?: string;
  queryTaskId?: string;
}

function parseArg(flag: string): string | undefined {
  const prefix = `--${flag}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function parseListArg(flag: string): string[] {
  const raw = parseArg(flag);
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function loadConfig(): CliConfig {
  const apiKey =
    process.env.HONGNIAO_API_KEY ||
    parseArg('api-key') ||
    '';
  const baseUrl =
    process.env.HONGNIAO_BASE_URL ||
    parseArg('base-url') ||
    DEFAULT_BASE_URL;

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, ''),
    createModel: parseArg('model'),
    createPrompt: parseArg('prompt'),
    aspectRatio: parseArg('aspect-ratio') || '9:16',
    seconds: parseArg('seconds') || '8',
    images: parseListArg('images'),
    audioUrls: parseListArg('audio-urls'),
    videoUrls: parseListArg('video-urls'),
    outputFile: parseArg('output'),
    queryTaskId: parseArg('query-task-id'),
  };
}

// ── API Helpers ─────────────────────────────────────────────────────

function apiHeaders(apiKey: string) {
  return { 'X-API-Key': apiKey, 'Content-Type': 'application/json' };
}

async function fetchModels(baseUrl: string, apiKey: string) {
  const resp = await axios.get(`${baseUrl}/v1/models`, {
    headers: apiHeaders(apiKey),
    timeout: 15000,
    validateStatus: (s) => s < 500,
  });
  const data = resp.data;
  if (data?.code !== undefined && data.code !== 200 && data.code !== 0) {
    throw new Error(`API error: ${data.message || data.msg || JSON.stringify(data)}`);
  }
  return (data?.data?.models || data?.models || []) as any[];
}

// Known image model IDs (from /v1/models response)
const IMAGE_MODEL_IDS = new Set(['gpt-image-2']);

async function createVideo(baseUrl: string, apiKey: string, params: {
  model: string;
  prompt: string;
  aspectRatio: string;
  seconds: string;
  images?: string[];
  audioUrls?: string[];
  videoUrls?: string[];
  resolution?: string;
}) {
  const body: Record<string, any> = {
    model: params.model,
    prompt: params.prompt,
    aspectRatio: params.aspectRatio,
    seconds: params.seconds,
  };
  if (params.images?.length) body.images = params.images;
  if (params.audioUrls?.length) body.audioUrls = params.audioUrls;
  if (params.videoUrls?.length) body.videoUrls = params.videoUrls;
  if (params.resolution) body.resolution = params.resolution;

  const resp = await axios.post(`${baseUrl}/v1/videos`, body, {
    headers: apiHeaders(apiKey),
    timeout: 600000,
    validateStatus: () => true,
  });
  return { statusCode: resp.status, data: resp.data };
}

async function createImage(baseUrl: string, apiKey: string, params: {
  model: string;
  prompt: string;
  aspectRatio: string;
  quality?: string;
  images?: string[];
}) {
  const body: Record<string, any> = {
    model: params.model,
    prompt: params.prompt,
    aspect_ratio: params.aspectRatio,
    parameters: {
      quality: params.quality || 'high',
    },
  };
  if (params.images?.length) body.images = params.images;

  const resp = await axios.post(`${baseUrl}/v1/images`, body, {
    headers: apiHeaders(apiKey),
    timeout: 600000,
    validateStatus: () => true,
  });
  return { statusCode: resp.status, data: resp.data };
}

async function queryTask(baseUrl: string, apiKey: string, taskId: string, modelHint?: string) {
  // Image tasks use /api/v1/images/{id}, video tasks use /api/v1/videos/{id}
  const isImageTask = modelHint && IMAGE_MODEL_IDS.has(modelHint);
  const path = isImageTask ? 'images' : 'videos';
  const resp = await axios.get(`${baseUrl}/api/v1/${path}/${encodeURIComponent(taskId)}`, {
    headers: apiHeaders(apiKey),
    timeout: 15000,
    validateStatus: () => true,
  });
  return { statusCode: resp.status, data: resp.data };
}

// ── Formatters ──────────────────────────────────────────────────────

function formatPrice(amount: number, currency: string): string {
  return `${currency === 'CNY' ? '¥' : '$'}${amount.toFixed(2)}`;
}

function printModelCard(model: any, index: number) {
  const id = model.id;
  const name = model.name || id;
  const type = model.type === 'video_generation' ? '🎬 Video' : model.type === 'image_generation' ? '🖼️  Image' : model.type;
  const price = model.pricing || model.price
    ? formatPrice(Number(model.pricing?.amount || model.price || 0), model.pricing?.currency || 'CNY')
    : 'N/A';
  const status = model.status === 'available' ? '✅' : '⛔';

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  [${index + 1}] ${status} ${type}  ${id}`);
  console.log(`       Name: ${name}  |  Price: ${price}/call`);
  console.log(`${'─'.repeat(70)}`);

  // Tasks / parameters
  const tasks = model.tasks || [];
  for (const task of tasks) {
    console.log(`       Task: ${task.taskKind}`);
    const params = task.parameters || [];
    for (const param of params) {
      const required = param.required ? '🔴' : '🟢';
      const mapsTo = param.mapsTo ? ` -> body.${param.mapsTo}` : '';
      let details = `           ${required} ${param.name} (${param.type})`;
      if (param.options?.length) {
        const opts = param.options.map((o: any) => o.value || o.label || o).join(' | ');
        details += `  options: [${opts}]`;
        if (param.defaultValue) details += `  default: ${param.defaultValue}`;
      }
      if (param.minItems !== undefined || param.maxItems !== undefined) {
        details += `  range: ${param.minItems ?? 0}-${param.maxItems ?? 'unlimited'}`;
      }
      details += mapsTo;
      console.log(details);
    }
    // Request example
    if (task.requestExample) {
      console.log(`       Example: ${JSON.stringify(task.requestExample)}`);
    }
  }
}

function printSummary(models: any[]) {
  const videoModels = models.filter((m) => m.type === 'video_generation');
  const imageModels = models.filter((m) => m.type === 'image_generation');

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  HongNiao AI API Summary`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`  Video Models: ${videoModels.length}`);
  console.log(`  Image Models: ${imageModels.length}`);
  console.log(`  Total: ${models.length}`);
  console.log(`\n  Video Models:`);
  for (const m of videoModels) {
    const price = m.pricing?.amount ? formatPrice(m.pricing.amount, m.pricing.currency) : 'N/A';
    console.log(`    - ${m.id} (${price}/call)`);
  }
  console.log(`\n  Image Models:`);
  for (const m of imageModels) {
    const price = m.pricing?.amount ? formatPrice(m.pricing.amount, m.pricing.currency) : 'N/A';
    console.log(`    - ${m.id} (${price}/call)`);
  }
}

function buildModelParamsMap(models: any[]): Record<string, any> {
  const map: Record<string, any> = {};
  for (const model of models) {
    const entry: any = {
      id: model.id,
      name: model.name,
      type: model.type,
      pricing: model.pricing,
      status: model.status,
      tasks: [],
    };
    for (const task of model.tasks || []) {
      const params: any[] = [];
      for (const param of task.parameters || []) {
        params.push({
          name: param.name,
          mapsTo: param.mapsTo,
          type: param.type,
          required: param.required,
          label: param.label,
          options: param.options || null,
          defaultValue: param.defaultValue || null,
          minItems: param.minItems ?? null,
          maxItems: param.maxItems ?? null,
        });
      }
      entry.tasks.push({ taskKind: task.taskKind, parameters: params, requestExample: task.requestExample || null });
    }
    map[model.id] = entry;
  }
  return map;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const config = loadConfig();

  if (!config.apiKey) {
    console.error('❌ Missing API key. Set HONGNIAO_API_KEY env var or pass --api-key=sk_xxx');
    console.error('   Example: npx tsx scripts/hongniao-api-explorer.ts --api-key=sk_f2800...');
    process.exit(1);
  }

  console.log(`🔗 Base URL: ${config.baseUrl}`);
  console.log(`🔑 API Key: ${config.apiKey.slice(0, 12)}...`);

  // ── Query existing task ──────────────────────────────────────────
  if (config.queryTaskId) {
    console.log(`\n🔍 Querying task: ${config.queryTaskId}`);
    const result = await queryTask(config.baseUrl, config.apiKey, config.queryTaskId, config.createModel);
    console.log(`   HTTP ${result.statusCode}`);
    console.log(`   Response: ${JSON.stringify(result.data, null, 2)}`);
    return;
  }

  // ── Create image or video ────────────────────────────────────────
  if (config.createModel && config.createPrompt) {
    const isImageModel = IMAGE_MODEL_IDS.has(config.createModel);

    if (isImageModel) {
      console.log(`\n🖼️  Creating image with model: ${config.createModel}`);
    } else {
      console.log(`\n🎬 Creating video with model: ${config.createModel}`);
    }
    console.log(`   Prompt: ${config.createPrompt}`);
    console.log(`   Aspect Ratio: ${config.aspectRatio}`);
    if (!isImageModel) console.log(`   Seconds: ${config.seconds}`);
    if (config.images.length) console.log(`   Images: ${config.images.join(', ')}`);
    if (config.audioUrls.length) console.log(`   Audio: ${config.audioUrls.join(', ')}`);
    if (config.videoUrls.length) console.log(`   Video: ${config.videoUrls.join(', ')}`);

    let result: { statusCode: number; data: any };
    if (isImageModel) {
      result = await createImage(config.baseUrl, config.apiKey, {
        model: config.createModel,
        prompt: config.createPrompt,
        aspectRatio: config.aspectRatio,
        quality: 'high',
        images: config.images,
      });
    } else {
      result = await createVideo(config.baseUrl, config.apiKey, {
        model: config.createModel,
        prompt: config.createPrompt,
        aspectRatio: config.aspectRatio,
        seconds: config.seconds,
        images: config.images,
        audioUrls: config.audioUrls,
        videoUrls: config.videoUrls,
      });
    }
    console.log(`\n   HTTP ${result.statusCode}`);
    console.log(`   Response:`);
    console.log(JSON.stringify(result.data, null, 2));

    // If we got a task ID, show the query URL
    if (result.data?.id) {
      console.log(`\n   📋 Query this task:`);
      console.log(`   npx tsx scripts/hongniao-api-explorer.ts --api-key=${config.apiKey.slice(0, 12)}... --model=${config.createModel} --query-task-id=${result.data.id}`);
    }
    return;
  }

  // ── Default: fetch and display models ────────────────────────────
  console.log(`\n📡 Fetching models from ${config.baseUrl}/v1/models ...`);

  let models: any[];
  try {
    models = await fetchModels(config.baseUrl, config.apiKey);
    console.log(`   ✅ Retrieved ${models.length} models`);
  } catch (err: any) {
    console.error(`   ❌ Failed: ${err.message}`);
    process.exit(1);
  }

  // Print detailed cards
  for (let i = 0; i < models.length; i++) {
    printModelCard(models[i], i);
  }

  // Print summary
  printSummary(models);

  // Save output if requested
  if (config.outputFile) {
    const outputPath = path.resolve(config.outputFile);
    const output = {
      fetchedAt: new Date().toISOString(),
      baseUrl: config.baseUrl,
      modelCount: models.length,
      models: buildModelParamsMap(models),
    };
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`\n📁 Saved to: ${outputPath}`);
  }

  console.log(`\n💡 Tips:`);
  console.log(`   Create video:  --model=veo_3_1-xs --prompt="..." --aspect-ratio=9:16 --seconds=8`);
  console.log(`   Create w/ ref: --model=xb-sora2 --prompt="..." --images=https://example.com/img.jpg`);
  console.log(`   Query task:    --query-task-id=task_xxx`);
  console.log(`   Save snapshot: --output=models-snapshot.json`);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err.message || err);
  process.exit(1);
});
