import '../src/utils/config';
import pool, { query } from '../src/utils/db';

const requireBindings = String(process.env.REQUIRE_TIER_BINDINGS || '').toLowerCase() === 'true';

async function main() {
  const features = await query<any>(
    "SELECT id, feature_key FROM model_features WHERE feature_key IN ('image_create','video_create') AND status = 'active'",
  );
  const keys = new Set(features.map(f => f.feature_key));
  if (!keys.has('image_create')) throw new Error('缺少 active feature: image_create');
  if (!keys.has('video_create')) throw new Error('缺少 active feature: video_create');

  const tiers = await query<any>(
    `SELECT t.id, t.tier_key, f.feature_key
       FROM model_tiers t
       JOIN model_features f ON f.id = t.feature_id
      WHERE t.status = 'active'
      ORDER BY f.sort_order, t.sort_order`,
  );
  if (!tiers.length) throw new Error('缺少 active model_tiers');

  for (const tier of tiers) {
    const caps = await query<any>('SELECT id FROM tier_capabilities WHERE tier_id = ?', [tier.id]);
    if (!caps.length) throw new Error(`档位 ${tier.tier_key} 缺少 capabilities`);

    const primary = await query<any>(
      "SELECT id FROM tier_model_bindings WHERE tier_id = ? AND binding_type = 'primary' LIMIT 1",
      [tier.id],
    );
    if (!primary.length) {
      const message = `档位 ${tier.tier_key} 尚未绑定主模型，前台暂不可用`;
      if (requireBindings) throw new Error(message);
      console.warn('warning:', message);
    }
  }

  console.log(requireBindings ? 'check:tiers passed (bindings required)' : 'check:tiers passed');
}

main()
  .catch(err => {
    console.error('check:tiers failed:', err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
