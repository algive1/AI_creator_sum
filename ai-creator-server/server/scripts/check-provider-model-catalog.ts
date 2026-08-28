/**
 * Production deployment gate for strict provider model catalogs.
 * It performs a read-only live preview and fails when the DB differs from the
 * upstream catalog or when a complete catalog cannot be proven.
 */

import '../src/utils/config';
import { endDbPool, query, queryOne } from '../src/utils/db';
import { decryptApiKey } from '../src/services/openai-adapter.service';
import { syncProviderModels, ProviderForModelSync } from '../src/services/model-sync.service';
import { modelSupportsFeature } from '../src/services/model-capability.service';

const ENV_KEYS: Record<string, string[]> = {
  xiaoma: ['XIAOMA_API_KEY', 'LK888_API_KEY'],
  hongniao: ['HONGNIAO_API_KEY', 'HONGNIAOAI_API_KEY'],
  agnes_ai: ['AGNES_API_KEY', 'AGNES_API_TOKEN', 'APIHUB_AGNES_API_KEY'],
};

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length).trim() : undefined;
}

function resolveApiKey(providerKey: string, encryptedKey: string): string {
  for (const envKey of ENV_KEYS[providerKey] || []) {
    const value = String(process.env[envKey] || '').trim();
    if (value && !/^(please_replace|please_change|your_|sk-your-|example_|test_)/i.test(value)) return value;
  }
  return decryptApiKey(encryptedKey || '').trim();
}

function stableWithoutCheckDate(value: any): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return JSON.stringify(value);
  const copy = { ...value };
  delete copy.source_checked_at;
  return JSON.stringify(copy, Object.keys(copy).sort());
}

function hasMeaningfulUpdates(updates: any[]): boolean {
  return updates.some((item) => item.fields.some((field: any) => {
    if (field.key !== 'config') return true;
    return stableWithoutCheckDate(field.before) !== stableWithoutCheckDate(field.after);
  }));
}

async function loadProvider(providerKey: string): Promise<(ProviderForModelSync & { api_key?: string }) | null> {
  return queryOne<any>(
    `SELECT id, name, provider_key, provider_type, api_base_url, api_key
       FROM ai_model_providers
      WHERE provider_key = ? AND deleted_at IS NULL
      LIMIT 1`,
    [providerKey],
  );
}

async function findEmptyActiveTiers(providerKeys: string[]): Promise<Array<{ tierKey: string; tierName: string }>> {
  const prefixes = providerKeys.map((providerKey) => `${providerKey}_`);
  if (!prefixes.length) return [];
  const prefixWhere = prefixes.map(() => 'LEFT(t.tier_key, ?) = ?').join(' OR ');
  const rows = await query<any>(
    `SELECT t.tier_key AS tierKey, t.tier_name AS tierName
       FROM model_tiers t
       LEFT JOIN tier_model_bindings b ON b.tier_id = t.id
       LEFT JOIN ai_models m
         ON m.id = b.model_id
        AND m.status = 'active'
        AND m.deleted_at IS NULL
       LEFT JOIN ai_model_providers p
         ON p.id = m.provider_id
        AND p.status = 'active'
        AND p.deleted_at IS NULL
        AND COALESCE(p.api_base_url, '') <> ''
        AND COALESCE(p.api_key, '') <> ''
      WHERE t.status = 'active'
        AND (${prefixWhere})
      GROUP BY t.id, t.tier_key, t.tier_name
     HAVING COUNT(m.id) = 0
      ORDER BY t.tier_key`,
    prefixes.flatMap((prefix) => [prefix.length, prefix]),
  );
  return rows.map((row) => ({ tierKey: String(row.tierKey || ''), tierName: String(row.tierName || '') }));
}

async function findUnsupportedActiveTiers(providerKeys: string[]): Promise<Array<{ tierKey: string; tierName: string }>> {
  const prefixes = providerKeys.map((providerKey) => `${providerKey}_`);
  if (!prefixes.length) return [];
  const prefixWhere = prefixes.map(() => 'LEFT(t.tier_key, ?) = ?').join(' OR ');
  const rows = await query<any>(
    `SELECT t.id AS tierId, t.tier_key AS tierKey, t.tier_name AS tierName,
            mf.feature_key AS featureKey, m.id AS modelId, m.model_type AS modelType
       FROM model_tiers t
       JOIN tier_model_bindings b ON b.tier_id = t.id
       JOIN ai_models m
         ON m.id = b.model_id
        AND m.status = 'active'
        AND m.deleted_at IS NULL
       JOIN ai_model_providers p
         ON p.id = m.provider_id
        AND p.status = 'active'
        AND p.deleted_at IS NULL
        AND COALESCE(p.api_base_url, '') <> ''
        AND COALESCE(p.api_key, '') <> ''
       JOIN model_features mf ON mf.id = t.feature_id
      WHERE t.status = 'active'
        AND (${prefixWhere})
      ORDER BY t.tier_key, b.binding_type, b.fallback_order`,
    prefixes.flatMap((prefix) => [prefix.length, prefix]),
  );
  const byTier = new Map<number, { tierKey: string; tierName: string; supported: boolean }>();
  for (const row of rows) {
    const tierId = Number(row.tierId);
    const current = byTier.get(tierId) || {
      tierKey: String(row.tierKey || ''),
      tierName: String(row.tierName || ''),
      supported: false,
    };
    if (!current.supported) {
      current.supported = await modelSupportsFeature(Number(row.modelId), String(row.featureKey || ''), String(row.modelType || '')).catch(() => false);
    }
    byTier.set(tierId, current);
  }
  return [...byTier.values()]
    .filter((tier) => !tier.supported)
    .map(({ tierKey, tierName }) => ({ tierKey, tierName }));
}

async function main(): Promise<void> {
  const raw = arg('providers') || arg('provider') || 'xiaoma,hongniao,agnes_ai';
  const providers = [...new Set(raw.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))];
  const problems: string[] = [];
  try {
    try {
      const emptyTiers = await findEmptyActiveTiers(providers);
      if (emptyTiers.length) {
        problems.push(`active tiers without an available model: ${emptyTiers.map((tier) => tier.tierKey || tier.tierName).join(', ')}`);
      }
      const unsupportedTiers = await findUnsupportedActiveTiers(providers);
      if (unsupportedTiers.length) {
        problems.push(`active tiers without a model supporting the tier feature: ${unsupportedTiers.map((tier) => tier.tierKey || tier.tierName).join(', ')}`);
      }
    } catch (error: any) {
      problems.push(`active-tier availability check failed: ${String(error?.message || error).slice(0, 300)}`);
    }

    for (const providerKey of providers) {
      const provider = await loadProvider(providerKey);
      if (!provider) {
        problems.push(`${providerKey}: provider row not found`);
        continue;
      }
      const apiKey = resolveApiKey(providerKey, provider.api_key || '');
      if (!apiKey) {
        problems.push(`${providerKey}: API key is not configured`);
        continue;
      }
      try {
        const preview = await syncProviderModels({ provider, apiKey, mode: 'preview' });
        const meaningfulUpdates = hasMeaningfulUpdates(preview.updates);
        console.log(`${providerKey}: remote=${preview.totalRemote}, add=${preview.additions.length}, update=${meaningfulUpdates ? preview.updates.length : 0}, remove=${preview.removals.length}, complete=${preview.catalogComplete}`);
        if (!preview.catalogComplete || preview.removalBlocked) problems.push(`${providerKey}: live catalog incomplete`);
        if (preview.additions.length) problems.push(`${providerKey}: ${preview.additions.length} models missing in DB`);
        if (meaningfulUpdates) problems.push(`${providerKey}: ${preview.updates.length} model capability/config changes pending`);
        if (preview.removals.length) problems.push(`${providerKey}: ${preview.removals.length} stale DB models pending hard deletion`);
      } catch (error: any) {
        problems.push(`${providerKey}: ${String(error?.message || error).slice(0, 300)}`);
      }
    }
  } finally {
    await endDbPool();
  }
  if (problems.length) {
    console.error('provider model catalog gate failed:');
    for (const problem of problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log('provider model catalog gate passed');
}

main().catch(async (error) => {
  console.error(`provider model catalog gate failed: ${String(error?.message || error).slice(0, 500)}`);
  await endDbPool().catch(() => undefined);
  process.exitCode = 1;
});
