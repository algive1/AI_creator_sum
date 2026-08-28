/**
 * Reconcile strict provider model catalogs with their live APIs.
 *
 * Usage:
 *   npx tsx scripts/sync-provider-models.ts --mode=preview
 *   npx tsx scripts/sync-provider-models.ts --mode=apply
 *   npx tsx scripts/sync-provider-models.ts --mode=apply --providers=xiaoma,hongniao,agnes_ai
 *
 * API keys are read from the matching environment variables first and then
 * from the encrypted provider row. Keys are never printed or written here.
 */

import '../src/utils/config';
import { endDbPool, query, queryOne } from '../src/utils/db';
import { decryptApiKey } from '../src/services/openai-adapter.service';
import { syncProviderModels, ProviderForModelSync, SyncMode } from '../src/services/model-sync.service';

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

function selectedProviderKeys(): string[] {
  const raw = arg('providers') || arg('provider') || 'xiaoma,hongniao,agnes_ai';
  return [...new Set(raw.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

function resolveApiKey(providerKey: string, encryptedKey: string): string {
  for (const envKey of ENV_KEYS[providerKey] || []) {
    const value = String(process.env[envKey] || '').trim();
    if (value && !/^(please_replace|please_change|your_|sk-your-|example_|test_)/i.test(value)) return value;
  }
  return decryptApiKey(encryptedKey || '').trim();
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

async function printDatabaseSummary(providerId: number): Promise<void> {
  const rows = await query<any>(
    `SELECT model_type AS modelType, COUNT(*) AS count
       FROM ai_models
      WHERE provider_id = ? AND deleted_at IS NULL
      GROUP BY model_type
      ORDER BY model_type`,
    [providerId],
  );
  console.log(`  database models: ${rows.reduce((sum, row) => sum + Number(row.count || 0), 0)} (${rows.map((row) => `${row.modelType}=${row.count}`).join(', ') || 'none'})`);
}

async function main(): Promise<void> {
  const modeRaw = (arg('mode') || 'preview').toLowerCase();
  const mode: SyncMode = modeRaw === 'apply' ? 'apply' : 'preview';
  const providerKeys = selectedProviderKeys();
  let failures = 0;

  console.log(`provider model catalog ${mode}`);
  console.log(`providers: ${providerKeys.join(', ')}`);

  try {
    for (const providerKey of providerKeys) {
      const provider = await loadProvider(providerKey);
      if (!provider) {
        console.error(`- ${providerKey}: provider row not found`);
        failures++;
        continue;
      }
      const apiKey = resolveApiKey(providerKey, provider.api_key || '');
      if (!apiKey) {
        console.error(`- ${providerKey}: API key is not configured`);
        failures++;
        continue;
      }

      try {
        const result = await syncProviderModels({ provider, apiKey, mode });
        console.log(`- ${providerKey}: remote=${result.totalRemote}, add=${result.additions.length}, update=${result.updates.length}, remove=${result.removals.length}, complete=${result.catalogComplete}`);
        if (result.failures.length) {
          console.error(`  catalog warnings: ${result.failures.map((item) => item.scope).join(', ')}`);
        }
        if (result.removalBlocked) {
          console.error('  removal blocked because the live catalog was incomplete');
          failures++;
        }
        if (mode === 'apply') await printDatabaseSummary(provider.id);
      } catch (error: any) {
        console.error(`- ${providerKey}: sync failed: ${String(error?.message || error).slice(0, 500)}`);
        failures++;
      }
    }
  } finally {
    await endDbPool();
  }

  if (failures) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(`provider model catalog failed: ${String(error?.message || error).slice(0, 500)}`);
  await endDbPool().catch(() => undefined);
  process.exitCode = 1;
});
