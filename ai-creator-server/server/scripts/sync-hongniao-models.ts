/**
 * HongNiao AI Model Sync Script
 *
 * Fetches latest models from HongNiao API and syncs them to the database.
 * Uses the existing model-sync.service.ts infrastructure.
 * Designed for cron/background execution.
 *
 * Usage:
 *   # Preview mode (dry-run) — shows what would change
 *   npx tsx scripts/sync-hongniao-models.ts
 *   npx tsx scripts/sync-hongniao-models.ts --mode=preview
 *
 *   # Apply mode — writes changes to database
 *   npx tsx scripts/sync-hongniao-models.ts --mode=apply
 *
 *   # With explicit API key
 *   npx tsx scripts/sync-hongniao-models.ts --mode=apply --api-key=sk_xxx
 *
 *   # With specific provider ID
 *   npx tsx scripts/sync-hongniao-models.ts --mode=apply --provider-id=9
 *
 *   # Auto-apply (for cron) — exits 0 even if nothing changed
 *   npx tsx scripts/sync-hongniao-models.ts --mode=auto
 *
 * Environment variables:
 *   HONGNIAO_API_KEY - API key (overrides DB provider key and --api-key)
 *   HONGNIAO_BASE_URL - Base URL (overrides DB provider URL)
 */

import fs from 'fs';
import path from 'path';
import { queryOne, query, getConnection } from '../src/utils/db';
import {
  fetchRemoteModels,
  buildModelSyncPreview,
  applyModelSyncPreview,
  generateHongniaoSeedMigration,
  SyncMode,
  ProviderForModelSync,
} from '../src/services/model-sync.service';
import { decryptApiKey } from '../src/services/openai-adapter.service';

// ── Config ──────────────────────────────────────────────────────────

interface CliConfig {
  mode: SyncMode | 'auto';
  apiKey?: string;
  baseUrl?: string;
  providerId?: number;
  outputMigration?: string;
  verbose: boolean;
}

function parseArg(flag: string): string | undefined {
  const prefix = `--${flag}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function loadConfig(): CliConfig {
  const modeRaw = parseArg('mode') || 'preview';
  let mode: SyncMode | 'auto' = 'preview';
  if (modeRaw === 'apply') mode = 'apply';
  else if (modeRaw === 'preview') mode = 'preview';
  else if (modeRaw === 'auto') mode = 'auto';

  const providerIdRaw = parseArg('provider-id');
  return {
    mode,
    apiKey: parseArg('api-key'),
    baseUrl: parseArg('base-url'),
    providerId: providerIdRaw ? parseInt(providerIdRaw, 10) : undefined,
    outputMigration: parseArg('output-migration'),
    verbose: process.argv.includes('--verbose') || process.argv.includes('-v'),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatModelSummary(preview: any): string {
  const lines: string[] = [];
  lines.push(`  Remote models: ${preview.totalRemote}`);
  lines.push(`  New (to add):  ${preview.additions.length}`);
  lines.push(`  Updates:       ${preview.updates.length}`);
  lines.push(`  Removals:      ${preview.removals?.length || 0}`);
  lines.push(`  Unchanged:     ${preview.skipped.length}`);
  if (preview.failures?.length) {
    lines.push(`  Failures:      ${preview.failures.length}`);
  }
  return lines.join('\n');
}

function formatAdditions(additions: any[]): string {
  return additions.map((a) => `    + ${a.apiModelName} (${a.modelType})`).join('\n');
}

function formatUpdates(updates: any[]): string {
  return updates.map((u) => {
    const fields = u.fields.map((f: any) => `${f.key}: ${JSON.stringify(f.before)} → ${JSON.stringify(f.after)}`).join(', ');
    return `    ~ ${u.apiModelName} [${fields}]`;
  }).join('\n');
}

// ── Main ────────────────────────────────────────────────────────────

function formatRemovals(removals: any[]): string {
  return removals.map((r) => `    - ${r.apiModelName} (${r.modelType}) bindings=${r.bindingCount || 0} fallbacks=${r.fallbackCount || 0}`).join('\n');
}

async function findHongniaoProvider(preferredId?: number): Promise<ProviderForModelSync | null> {
  if (preferredId) {
    const row = await queryOne<any>(
      `SELECT id, name, provider_key, provider_type, api_base_url, api_key
         FROM ai_model_providers
        WHERE id = ? AND deleted_at IS NULL`,
      [preferredId],
    );
    if (row) return row;
    console.warn(`⚠️  Provider id=${preferredId} not found, searching for any HongNiao provider...`);
  }

  // Find the first active HongNiao provider
  const row = await queryOne<any>(
    `SELECT id, name, provider_key, provider_type, api_base_url, api_key
       FROM ai_model_providers
      WHERE deleted_at IS NULL
        AND (provider_key = 'hongniao' OR provider_type = 'hongniao' OR name LIKE '%hongniao%' OR name LIKE '%红鸟%')
      ORDER BY status = 'active' DESC, id ASC
      LIMIT 1`,
  );
  return row || null;
}

async function main() {
  const config = loadConfig();

  console.log('═'.repeat(60));
  console.log('  HongNiao AI Model Sync');
  console.log('═'.repeat(60));
  console.log(`  Mode: ${config.mode}`);
  console.log(`  Time: ${new Date().toISOString()}`);

  // 1. Find provider
  const provider = await findHongniaoProvider(config.providerId);
  if (!provider) {
    console.error('\n❌ No HongNiao provider found in database.');
    console.error('   Please configure a provider with provider_key = "hongniao" in the admin panel.');
    console.error('   Or run: npx tsx scripts/hongniao-api-explorer.ts --api-key=sk_xxx');
    process.exit(1);
  }

  console.log(`\n📋 Provider: ${provider.name} (id=${provider.id})`);
  console.log(`   Type: ${provider.provider_type || provider.provider_key}`);
  console.log(`   Base URL: ${provider.api_base_url || '(not set — using default)'}`);

  // 2. Resolve API key
  const apiKey =
    config.apiKey ||
    process.env.HONGNIAO_API_KEY ||
    decryptApiKey(provider.api_key || '') ||
    '';
  if (!apiKey) {
    console.error('\n❌ No API key available.');
    console.error('   Set HONGNIAO_API_KEY env var, pass --api-key=sk_xxx, or configure the provider api_key.');
    process.exit(1);
  }

  const baseUrl = (config.baseUrl || process.env.HONGNIAO_BASE_URL || provider.api_base_url || 'https://open.hongniaoai.com')
    .replace(/\/v1\/?$/, '').replace(/\/+$/, '');

  console.log(`   Base URL: ${baseUrl}`);
  console.log(`   API Key: ${apiKey.slice(0, 12)}...`);

  // 3. Fetch remote models
  console.log(`\n📡 Fetching models from ${baseUrl}/v1/models ...`);
  const remote = await fetchRemoteModels(
    { ...provider, api_base_url: baseUrl },
    apiKey,
  );

  if (remote.failures.length) {
    console.error(`   ⚠️  ${remote.failures.length} failure(s):`);
    for (const f of remote.failures) {
      console.error(`      - ${f.scope}: ${f.message}`);
    }
  }
  console.log(`   ✅ Retrieved ${remote.models.length} remote models`);

  if (!remote.models.length) {
    console.error('\n❌ No models retrieved. Aborting.');
    process.exit(1);
  }

  if (config.outputMigration) {
    const outputPath = path.resolve(config.outputMigration);
    const sql = generateHongniaoSeedMigration({
      models: remote.models,
      checkedAt: new Date().toISOString().slice(0, 10),
      migrationName: 'Refresh Hongniao seed data from live model API.',
    });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, sql, 'utf8');
    console.log(`\nSeed migration written: ${outputPath}`);
  }

  // 4. Build preview
  const existingRows = await query<any>(
    `SELECT id, provider_id, name, display_name, model_type, api_model_name, upstream_model_code, query_task_url, config
       FROM ai_models
      WHERE provider_id = ? AND deleted_at IS NULL`,
    [provider.id],
  );

  const preview = buildModelSyncPreview({
    providerId: provider.id,
    providerName: provider.name,
    existingRows,
    remoteModels: remote.models,
    failures: remote.failures,
    removalPolicy: 'soft',
  });

  console.log(`\n📊 Sync Preview:`);
  console.log(formatModelSummary(preview));

  if (preview.additions.length) {
    console.log(`\n   🆕 New models to add:`);
    console.log(formatAdditions(preview.additions));
  }

  if (preview.updates.length) {
    console.log(`\n   🔄 Models to update:`);
    console.log(formatUpdates(preview.updates));
  }

  if (preview.removals.length) {
    console.log(`\n   Models missing upstream, to soft-disable:`);
    console.log(formatRemovals(preview.removals));
  }

  if (!preview.additions.length && !preview.updates.length && !preview.removals.length) {
    console.log(`\n   ✅ All models up-to-date. Nothing to sync.`);
    process.exit(0);
  }

  // 5. Apply (if mode is apply or auto)
  const shouldApply = config.mode === 'apply' || config.mode === 'auto';
  if (!shouldApply) {
    console.log(`\n💡 Preview mode — no changes applied.`);
    console.log(`   Run with --mode=apply to apply these changes.`);
    console.log(`   Run with --mode=auto for cron-friendly auto-apply.`);
    process.exit(0);
  }

  console.log(`\n📝 Applying changes...`);
  const applied = await applyModelSyncPreview(provider.id, preview);
  console.log(`   Soft-disabled: ${applied.removed} models`);
  console.log(`   Removed bindings: ${applied.bindingDeleted}`);
  console.log(`   Removed fallback rules: ${applied.fallbackDeleted}`);
  console.log(`   ✅ Added: ${applied.added} models`);
  console.log(`   ✅ Updated: ${applied.updated} models`);
  console.log(`   ⏭️  Skipped: ${preview.skipped.length} models`);

  // 6. Additional: sync tier bindings for newly added models
  if (applied.added > 0) {
    console.log(`\n🔗 Repairing tier model bindings for new models...`);
    try {
      await repairHongniaoVideoTierBindings(provider.id);
      console.log(`   ✅ Tier bindings repaired.`);
    } catch (err: any) {
      console.warn(`   ⚠️  Tier binding repair failed (non-fatal): ${err.message}`);
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Sync complete: +${applied.added} ~${applied.updated} -${applied.removed} =${preview.skipped.length}`);
  console.log(`${'═'.repeat(60)}`);
}

/**
 * Ensure newly synced HongNiao video models are bound to all active tiers
 * with default pricing and capabilities. This mirrors the logic in
 * the HongNiao refresh migration.
 */
async function repairHongniaoVideoTierBindings(providerId: number): Promise<void> {
  const conn = await getConnection();
  try {
    // Insert tier_model_bindings for any HongNiao video model not yet bound
    await conn.execute(
      `INSERT IGNORE INTO tier_model_bindings (tier_id, model_id, points_cost, sort_order, created_at, updated_at)
       SELECT t.id, m.id, 0, 999, NOW(3), NOW(3)
         FROM member_tiers t
         JOIN ai_models m ON m.provider_id = ?
        WHERE t.deleted_at IS NULL
          AND m.deleted_at IS NULL
          AND m.model_type = 'video'
          AND NOT EXISTS (
            SELECT 1 FROM tier_model_bindings b WHERE b.tier_id = t.id AND b.model_id = m.id
          )`,
      [providerId],
    );

    // Ensure tier_capabilities for HongNiao video features exist
    await conn.execute(
      `INSERT IGNORE INTO tier_capabilities (tier_id, capability_key, capability_value, created_at, updated_at)
       SELECT t.id, 'video_create', 'true', NOW(3), NOW(3)
         FROM member_tiers t
        WHERE t.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM tier_capabilities c WHERE c.tier_id = t.id AND c.capability_key = 'video_create'
          )`,
    );

    await conn.execute(
      `INSERT IGNORE INTO tier_capabilities (tier_id, capability_key, capability_value, created_at, updated_at)
       SELECT t.id, 'image_to_video', 'true', NOW(3), NOW(3)
         FROM member_tiers t
        WHERE t.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM tier_capabilities c WHERE c.tier_id = t.id AND c.capability_key = 'image_to_video'
          )`,
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ── Run ─────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error('\n❌ Sync failed:', err.message || err);
  if (process.argv.includes('--verbose')) {
    console.error(err.stack);
  }
  process.exit(1);
});
