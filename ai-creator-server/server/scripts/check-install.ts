import '../src/utils/config';
import mysql from 'mysql2/promise';
import { executeInit, saveSystemConfig, setTempDbConfigForCheck, validateAdmin } from '../src/services/install.service';

const cfg = {
  host: process.env.CHECK_DB_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.CHECK_DB_PORT || process.env.DB_PORT || '3306', 10),
  database: process.env.CHECK_DB_NAME || 'ai_creator_check',
  user: process.env.CHECK_DB_USER || process.env.DB_USER || 'root',
  password: process.env.CHECK_DB_PASSWORD || process.env.DB_PASSWORD || '',
  prefix: '',
  autoCreate: true,
};

const requiredTables = [
  'schema_migrations', 'app_releases', 'release_update_logs', 'config_check_results',
  'users', 'user_profiles', 'point_accounts', 'point_logs', 'user_assets', 'signin_records', 'ad_reward_logs',
  'point_tasks', 'user_point_task_logs', 'ai_model_providers', 'ai_models', 'ai_model_capabilities', 'ai_model_fallback_rules', 'ai_tasks', 'ai_task_inputs',
  'ai_task_outputs', 'ai_task_logs', 'ai_model_call_logs', 'ai_task_cost_logs', 'ai_model_price_rules',
  'admin_users', 'admin_operation_logs', 'audit_logs', 'files', 'file_upload_logs', 'file_delete_logs', 'file_export_records', 'storage_configs',
  'system_configs', 'config_change_logs', 'app_configs', 'model_features', 'model_tiers', 'tier_model_bindings', 'tier_capabilities',
  'member_versions', 'member_plans', 'member_benefit_icons', 'member_plan_rights', 'member_plan_point_rules', 'user_memberships', 'member_orders',
  'point_packages', 'payment_logs', 'invite_relations', 'user_invites', 'invite_reward_logs', 'work_favorites',
  'template_categories', 'template_tags', 'template_favorites', 'template_tag_relations', 'template_usage_logs', 'template_review_logs', 'templates',
  'announcements', 'announcement_user_records', 'legal_documents', 'user_legal_acceptances', 'user_compliance_confirmations', 'system_prompts',
];

const requiredColumns: Record<string, string[]> = {
  ai_tasks: [
    'tier_id', 'actual_model_id', 'provider_task_id', 'provider_status', 'provider_status_message',
    'provider_started_at', 'next_poll_at', 'poll_count', 'last_polled_at', 'video_mode',
    'video_duration', 'video_ratio', 'processing_lock_until', 'failed_at', 'canceled_at',
  ],
  files: ['metadata_sanitized', 'ai_implicit_label_kept', 'platform_watermark_removed'],
  point_accounts: ['total_refunded'],
  signin_records: ['normal_signed_at', 'super_signed_at', 'super_streak_day', 'super_reward_points', 'normal_is_makeup'],
  ad_reward_logs: ['ad_scene', 'expires_at', 'claimed_at'],
  templates: [
    'title', 'template_type', 'target_feature', 'source', 'prompt', 'params_json', 'ratio', 'style',
    'tags_json', 'is_enabled', 'visibility', 'status', 'review_status', 'usage_count', 'favorite_count',
  ],
  member_orders: [
    'product_id', 'product_name', 'amount_total', 'currency', 'points_amount', 'member_plan_id',
    'member_duration_days', 'pay_status', 'pay_channel', 'wx_prepay_id', 'grant_status', 'grant_at',
  ],
  member_plan_rights: ['icon_url', 'icon_file_id'],
};

const requiredTiers = ['image_standard', 'image_pro', 'image_top', 'video_standard', 'video_pro', 'video_top'];

async function main() {
  if (cfg.database === process.env.DB_NAME) throw new Error('CHECK_DB_NAME 不能等于正式 DB_NAME');
  const root = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password });
  await root.query(`DROP DATABASE IF EXISTS ${mysql.escapeId(cfg.database)}`);
  await root.query(`CREATE DATABASE ${mysql.escapeId(cfg.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.end();

  setTempDbConfigForCheck(cfg);
  await saveSystemConfig({ siteName: 'AI Creator Check', adminPath: 'admin', timezone: 'Asia/Shanghai', storageType: 'local', debugMode: true, allowRegister: true });
  const admin = await validateAdmin({ username: 'admin_check', password: 'Admin12345', confirmPassword: 'Admin12345' });
  if (!admin.valid) throw new Error(admin.error || '管理员校验失败');

  const result = await executeInit();
  if (!result.success) throw new Error(JSON.stringify(result.steps, null, 2));

  const conn = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database });
  try {
    const placeholders = requiredTables.map(() => '?').join(',');
    const [rows] = await conn.execute(
      `SELECT TABLE_NAME AS table_name FROM information_schema.tables WHERE table_schema = ? AND table_name IN (${placeholders})`,
      [cfg.database, ...requiredTables],
    ) as any;
    const existing = new Set(rows.map((r: any) => r.table_name));
    const missing = requiredTables.filter(t => !existing.has(t));
    if (missing.length) throw new Error('缺少必需表: ' + missing.join(', '));

    for (const [tableName, columns] of Object.entries(requiredColumns)) {
      const columnPlaceholders = columns.map(() => '?').join(',');
      const [columnRows] = await conn.execute(
        `SELECT COLUMN_NAME AS column_name
           FROM information_schema.columns
          WHERE table_schema = ? AND table_name = ? AND column_name IN (${columnPlaceholders})`,
        [cfg.database, tableName, ...columns],
      ) as any;
      const existingColumns = new Set(columnRows.map((r: any) => r.column_name));
      const missingColumns = columns.filter(column => !existingColumns.has(column));
      if (missingColumns.length) throw new Error(`${tableName} 缺少字段: ${missingColumns.join(', ')}`);
    }

    const [indexRows] = await conn.execute(
      `SELECT DISTINCT INDEX_NAME AS index_name
         FROM information_schema.statistics
        WHERE table_schema = ? AND table_name = 'ai_tasks' AND index_name = 'idx_video_poll'`,
      [cfg.database],
    ) as any;
    if (!indexRows.length) throw new Error('ai_tasks 缺少索引: idx_video_poll');

    const [memberRightIndexRows] = await conn.execute(
      `SELECT DISTINCT INDEX_NAME AS index_name
         FROM information_schema.statistics
        WHERE table_schema = ? AND table_name = 'member_plan_rights' AND index_name = 'uk_plan_right'`,
      [cfg.database],
    ) as any;
    if (!memberRightIndexRows.length) throw new Error('member_plan_rights 缺少索引: uk_plan_right');

    const requiredIndexes: Array<[string, string]> = [
      ['ad_reward_logs', 'idx_ad_reward_scene_user_date'],
      ['member_plan_rights', 'idx_icon_file'],
      ['member_benefit_icons', 'uk_icon_key'],
      ['member_benefit_icons', 'idx_status_sort'],
      ['templates', 'idx_templates_public'],
      ['templates', 'idx_templates_feature'],
      ['member_orders', 'idx_order_pay_status'],
      ['member_orders', 'idx_order_type_created'],
    ];
    for (const [tableName, indexName] of requiredIndexes) {
      const [rows] = await conn.execute(
        `SELECT DISTINCT INDEX_NAME AS index_name
           FROM information_schema.statistics
          WHERE table_schema = ? AND table_name = ? AND index_name = ?`,
        [cfg.database, tableName, indexName],
      ) as any;
      if (!rows.length) throw new Error(`${tableName} 缺少索引: ${indexName}`);
    }

    const [features] = await conn.execute(
      "SELECT feature_key FROM model_features WHERE feature_key IN ('image_create','video_create') AND status = 'active'",
    ) as any;
    const featureKeys = new Set(features.map((f: any) => f.feature_key));
    if (!featureKeys.has('image_create')) throw new Error('缺少 active feature: image_create');
    if (!featureKeys.has('video_create')) throw new Error('缺少 active feature: video_create');

    const [tiers] = await conn.execute(
      `SELECT t.id, t.tier_key
         FROM model_tiers t
         JOIN model_features f ON f.id = t.feature_id
        WHERE f.feature_key IN ('image_create','video_create') AND t.status = 'active'`,
    ) as any;
    const tierKeys = new Set(tiers.map((t: any) => t.tier_key));
    const missingTiers = requiredTiers.filter(t => !tierKeys.has(t));
    if (missingTiers.length) throw new Error('缺少默认档位: ' + missingTiers.join(', '));

    for (const tier of tiers) {
      const [caps] = await conn.execute('SELECT id FROM tier_capabilities WHERE tier_id = ?', [tier.id]) as any;
      if (!caps.length) throw new Error(`档位 ${tier.tier_key} 缺少 capabilities`);
    }
  } finally {
    await conn.end();
  }

  console.log('check:install passed');
}

main().catch(err => {
  console.error('check:install failed:', err.message || err);
  process.exit(1);
});
