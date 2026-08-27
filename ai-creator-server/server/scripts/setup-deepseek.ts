/**
 * Setup DeepSeek provider: write API key, bind model to tiers, enable prompt optimization.
 *
 * Usage: npx tsx scripts/setup-deepseek.ts --api-key=sk_xxx
 */
import { queryOne, query, getConnection } from '../src/utils/db';
import { encryptApiKey } from '../src/services/openai-adapter.service';

async function main() {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.argv.find(a => a.startsWith('--api-key='))?.split('=')[1];
  if (!apiKey) {
    console.error('Missing --api-key. Usage: npx tsx scripts/setup-deepseek.ts --api-key=sk_xxx');
    process.exit(1);
  }

  // 1. Find DeepSeek provider
  const provider = await queryOne<any>(
    `SELECT id, name, provider_key, api_key FROM ai_model_providers WHERE provider_key = 'deepseek' AND deleted_at IS NULL LIMIT 1`
  );
  if (!provider) {
    console.error('DeepSeek provider not found. Run the seed migration first: 20260617_002_seed_deepseek_prompt_optimize.sql');
    process.exit(1);
  }
  console.log(`Provider: ${provider.name} (id=${provider.id})`);

  // 2. Write encrypted API key
  const encrypted = encryptApiKey(apiKey);
  await query('UPDATE ai_model_providers SET api_key = ?, updated_at = NOW(3) WHERE id = ?', [encrypted, provider.id]);
  console.log('API key encrypted and saved.');

  // 3. Find DeepSeek model
  const model = await queryOne<any>(
    `SELECT id, name, model_type, api_model_name FROM ai_models WHERE provider_id = ? AND api_model_name = 'deepseek-v4-flash' AND deleted_at IS NULL LIMIT 1`,
    [provider.id]
  );
  if (!model) {
    console.error('DeepSeek model not found.');
    process.exit(1);
  }
  console.log(`Model: ${model.name} (id=${model.id})`);

  // 4. Bind model to prompt_optimize tiers
  const tiers = await query<any>(
    `SELECT t.id, t.tier_name, t.tier_key
       FROM model_tiers t
       JOIN model_features f ON f.id = t.feature_id
      WHERE f.feature_key = 'prompt_optimize'
      ORDER BY t.sort_order`
  );
  console.log(`Found ${tiers.length} prompt_optimize tiers:`, tiers.map((t: any) => t.tier_name));

  let bound = 0;
  for (const tier of tiers) {
    await query(
      `INSERT IGNORE INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order)
       VALUES (?, ?, 'primary', 1)`,
      [tier.id, model.id]
    );
    bound++;
    console.log(`  Bound to: ${tier.tier_name} (tier_id=${tier.id})`);
  }

  // Also bind to tool_prompt_reverse tiers
  const reverseTiers = await query<any>(
    `SELECT t.id, t.tier_name, t.tier_key
       FROM model_tiers t
       JOIN model_features f ON f.id = t.feature_id
      WHERE f.feature_key = 'tool_prompt_reverse'
      ORDER BY t.sort_order`
  );
  console.log(`Found ${reverseTiers.length} tool_prompt_reverse tiers:`, reverseTiers.map((t: any) => t.tier_name));
  for (const tier of reverseTiers) {
    await query(
      `INSERT IGNORE INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order)
       VALUES (?, ?, 'primary', 1)`,
      [tier.id, model.id]
    );
    bound++;
    console.log(`  Bound to: ${tier.tier_name} (tier_id=${tier.id})`);
  }
  console.log(`Total bindings created: ${bound}`);

  // 5. Enable prompt optimization system config
  await query(
    `INSERT INTO system_configs (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
     VALUES ('ai.prompt_optimize.enabled', 'true', 'boolean', 'ai', 0, 'Enable mini-program prompt optimization', 10, NOW(3), NOW(3))
     ON DUPLICATE KEY UPDATE config_value = 'true', updated_at = NOW(3)`
  );
  await query(
    `INSERT INTO system_configs (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
     VALUES ('ai.prompt_optimize.model_id', CAST(? AS CHAR), 'string', 'ai', 0, 'Default text model ID for prompt optimization', 11, NOW(3), NOW(3))
     ON DUPLICATE KEY UPDATE config_value = CAST(? AS CHAR), updated_at = NOW(3)`,
    [String(model.id), String(model.id)]
  );
  await query(
    `INSERT INTO system_configs (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at)
     VALUES ('ai.prompt_optimize.points_cost', '0', 'number', 'ai', 0, 'Prompt optimization points cost', 12, NOW(3), NOW(3))
     ON DUPLICATE KEY UPDATE config_value = '0', updated_at = NOW(3)`
  );
  console.log('Prompt optimization enabled with DeepSeek as default model.');

  console.log('\nDone! DeepSeek API key saved and model bound to prompt optimization tiers.');
  console.log('Verify in admin panel: AI模型管理 → 真实模型测试 → 选择 DeepSeek V4 Flash.');
}

main().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
