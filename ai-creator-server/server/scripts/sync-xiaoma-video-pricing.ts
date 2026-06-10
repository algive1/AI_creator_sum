import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { queryOne } from '../src/utils/db';
import { decryptApiKey } from '../src/services/openai-adapter.service';

interface XiaomaModel {
  id: string;
  name: string;
  raw: any;
}

const DEFAULT_BASE_URL = 'https://api.lk888.ai';

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log('Usage: npm run sync:xiaoma-video-pricing -- [--models=sora-2,veo3.1] [--output=../docs/xiaoma-video-pricing.snapshot.json]');
    console.log('Fetches Xiaoma video model pricing snapshot only. It never updates model_tiers pricing.');
    return;
  }

  const provider = await queryOne<any>(
    `SELECT api_base_url, api_key
       FROM ai_model_providers
      WHERE deleted_at IS NULL
        AND (provider_key = 'xiaoma' OR provider_type = 'xiaoma')
      ORDER BY status = 'active' DESC, id ASC
      LIMIT 1`,
  );
  const apiKey = String(process.env.XIAOMA_API_KEY || process.env.LK888_API_KEY || decryptApiKey(provider?.api_key || '') || '').trim();
  const baseUrl = String(process.env.XIAOMA_API_BASE_URL || provider?.api_base_url || DEFAULT_BASE_URL).replace(/\/v1\/?$/, '').replace(/\/$/, '');
  if (!apiKey) throw new Error('Missing Xiaoma API key. Configure provider api_key or XIAOMA_API_KEY.');

  const selected = parseModelsArg();
  const output = parseArg('--output=') || path.resolve(__dirname, '../../docs/xiaoma-video-pricing.snapshot.json');
  const models = await fetchVideoModels(baseUrl, apiKey);
  const targetModels = selected.length ? models.filter((model) => selected.includes(model.id)) : models;
  const pricing: any[] = [];

  for (const model of targetModels) {
    try {
      const resp = await axios.get(`${baseUrl}/v1/skills/models/${encodeURIComponent(model.id)}/pricing?status=active`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 20000,
      });
      pricing.push({
        model: model.id,
        name: model.name,
        ok: true,
        pricing: resp.data,
      });
    } catch (err: any) {
      pricing.push({
        model: model.id,
        name: model.name,
        ok: false,
        error: err?.response?.data || err?.message || String(err),
      });
    }
  }

  const snapshot = {
    fetchedAt: new Date().toISOString(),
    source: 'xiaoma',
    baseUrl,
    modelCount: models.length,
    fetchedPricingCount: pricing.length,
    note: 'Snapshot only. Do not treat upstream cost as platform points_cost.',
    pricing,
  };

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(snapshot, null, 2), 'utf8');
  console.log(`xiaoma video pricing snapshot written: ${output}`);
  console.log(`models=${models.length}, pricing=${pricing.length}, failed=${pricing.filter((item) => !item.ok).length}`);
}

async function fetchVideoModels(baseUrl: string, apiKey: string): Promise<XiaomaModel[]> {
  const resp = await axios.get(`${baseUrl}/v1/skills/models?type=video`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    timeout: 20000,
  });
  const rawModels = Array.isArray(resp.data?.models) ? resp.data.models : Array.isArray(resp.data?.data) ? resp.data.data : [];
  return rawModels.map((item: any) => {
    const id = String(item?.name || item?.id || '').trim();
    return {
      id,
      name: String(item?.display_name || item?.displayName || item?.name || id).trim(),
      raw: item,
    };
  }).filter((item: XiaomaModel) => item.id);
}

function parseModelsArg(): string[] {
  const raw = parseArg('--models=');
  if (!raw) return [];
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

function parseArg(prefix: string): string {
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : '';
}

main().catch((err: any) => {
  console.error('sync:xiaoma-video-pricing failed:', err?.message || err);
  process.exitCode = 1;
});
