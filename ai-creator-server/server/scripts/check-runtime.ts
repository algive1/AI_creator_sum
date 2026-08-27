import pool, { query, queryOne } from '../src/utils/db';
import { SettingsService } from '../src/services/settings.service';
import { decryptApiKey } from '../src/services/openai-adapter.service';
import { getModelCapabilitySet, hasAnyCapability } from '../src/services/model-capability.service';

type Status = 'pass' | 'warn' | 'fail';

interface CheckResult {
  status: Status;
  name: string;
  message: string;
}

const results: CheckResult[] = [];

const REQUIRED_TABLES = [
  'schema_migrations',
  'app_releases',
  'release_update_logs',
  'config_check_results',
  'users',
  'user_profiles',
  'point_accounts',
  'point_logs',
  'user_assets',
  'signin_records',
  'ad_reward_logs',
  'point_tasks',
  'user_point_task_logs',
  'ai_model_providers',
  'ai_models',
  'ai_model_capabilities',
  'ai_model_fallback_rules',
  'ai_model_price_rules',
  'ai_tasks',
  'ai_task_inputs',
  'ai_task_outputs',
  'ai_task_logs',
  'ai_model_call_logs',
  'ai_task_cost_logs',
  'admin_users',
  'admin_operation_logs',
  'audit_logs',
  'files',
  'file_upload_logs',
  'file_delete_logs',
  'file_export_records',
  'storage_configs',
  'system_configs',
  'app_configs',
  'config_change_logs',
  'model_features',
  'model_tiers',
  'tier_model_bindings',
  'tier_capabilities',
  'member_versions',
  'member_plans',
  'member_benefit_icons',
  'member_plan_rights',
  'member_plan_point_rules',
  'user_memberships',
  'member_orders',
  'point_packages',
  'payment_logs',
  'invite_relations',
  'user_invites',
  'invite_reward_logs',
  'work_favorites',
  'template_categories',
  'templates',
  'template_tags',
  'template_favorites',
  'template_tag_relations',
  'template_usage_logs',
  'template_review_logs',
  'announcements',
  'announcement_user_records',
  'legal_documents',
  'user_legal_acceptances',
  'user_compliance_confirmations',
  'system_prompts',
];

const REQUIRED_COLUMNS: Record<string, string[]> = {
  ai_tasks: [
    'tier_id',
    'actual_model_id',
    'provider_task_id',
    'provider_status',
    'provider_status_message',
    'provider_started_at',
    'next_poll_at',
    'poll_count',
    'last_polled_at',
    'video_mode',
    'video_duration',
    'video_ratio',
    'processing_lock_until',
    'failed_at',
    'canceled_at',
  ],
  files: ['metadata_sanitized', 'ai_implicit_label_kept', 'platform_watermark_removed'],
  point_accounts: ['total_refunded'],
  signin_records: ['normal_signed_at', 'super_signed_at', 'super_streak_day', 'super_reward_points', 'normal_is_makeup', 'updated_at'],
  ad_reward_logs: ['ad_scene', 'expires_at', 'claimed_at'],
  templates: [
    'title',
    'template_type',
    'target_feature',
    'source',
    'prompt',
    'params_json',
    'ratio',
    'style',
    'tags_json',
    'is_enabled',
    'visibility',
    'status',
    'review_status',
    'usage_count',
    'favorite_count',
  ],
  member_orders: [
    'product_id',
    'product_name',
    'amount_total',
    'currency',
    'points_amount',
    'member_plan_id',
    'member_duration_days',
    'pay_status',
    'pay_channel',
    'wx_prepay_id',
    'grant_status',
    'grant_at',
  ],
  member_plan_rights: ['icon_url', 'icon_file_id'],
};

const REQUIRED_INDEXES: Record<string, string[]> = {
  ad_reward_logs: ['idx_ad_reward_scene_user_date'],
  ai_tasks: ['idx_video_poll', 'idx_user_status_created'],
  ai_task_outputs: ['uk_task_output_index'],
  point_logs: ['idx_user_created'],
  member_plan_rights: ['uk_plan_right', 'idx_icon_file'],
  member_benefit_icons: ['uk_icon_key', 'idx_status_sort'],
  templates: ['idx_templates_public', 'idx_templates_feature'],
  member_orders: ['idx_order_pay_status', 'idx_order_type_created', 'idx_user_status_created'],
  user_memberships: ['idx_user_status_expire'],
};

const TEXT_FEATURES = [
  { key: 'prompt_optimize', label: '智能优化', capabilities: ['text_chat', 'prompt_optimize'] },
  { key: 'script_generate', label: '脚本生成', capabilities: ['text_chat', 'script_generate'] },
  { key: 'prompt_generate', label: '提示词生成', capabilities: ['text_chat', 'prompt_generate'] },
  { key: 'storyboard_generate', label: '分镜生成', capabilities: ['text_chat', 'storyboard_generate'] },
] as const;

function add(status: Status, name: string, message: string) {
  results.push({ status, name, message });
}

function icon(status: Status) {
  if (status === 'pass') return '✔';
  if (status === 'warn') return '⚠';
  return '✖';
}

function isEnabled(value: any): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on', 'active', 'enabled'].includes(normalized);
}

function parseIntSafe(value: any, fallback = 0): number {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function tableExists(tableName: string): Promise<boolean> {
  const row = await queryOne<any>(
    `SELECT COUNT(*) AS cnt
       FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?`,
    [tableName],
  );
  return Number(row?.cnt || 0) > 0;
}

async function providerHasActiveTierBinding(providerId: number): Promise<boolean> {
  const row = await queryOne<any>(
    `SELECT 1 AS ok
       FROM tier_model_bindings b
       JOIN model_tiers t ON t.id = b.tier_id AND t.status = 'active'
       JOIN model_features f ON f.id = t.feature_id AND f.status = 'active'
       JOIN ai_models m ON m.id = b.model_id AND m.status = 'active'
      WHERE m.provider_id = ?
      LIMIT 1`,
    [providerId],
  );
  return !!row;
}

async function checkTables() {
  for (const table of REQUIRED_TABLES) {
    const exists = await tableExists(table);
    add(exists ? 'pass' : 'fail', `数据表 ${table}`, exists ? '存在' : '缺失');
  }
}

async function checkColumns() {
  for (const [tableName, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const placeholders = columns.map(() => '?').join(',');
    const rows = await query<any>(
      `SELECT COLUMN_NAME AS column_name
         FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ? AND column_name IN (${placeholders})`,
      [tableName, ...columns],
    );
    const existing = new Set(rows.map((row: any) => row.column_name));
    for (const column of columns) {
      const ok = existing.has(column);
      add(ok ? 'pass' : 'fail', `column ${tableName}.${column}`, ok ? 'exists' : 'missing');
    }
  }
}

async function checkIndexes() {
  for (const [tableName, indexes] of Object.entries(REQUIRED_INDEXES)) {
    const placeholders = indexes.map(() => '?').join(',');
    const rows = await query<any>(
      `SELECT DISTINCT INDEX_NAME AS index_name
         FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = ? AND index_name IN (${placeholders})`,
      [tableName, ...indexes],
    );
    const existing = new Set(rows.map((row: any) => row.index_name));
    for (const index of indexes) {
      const ok = existing.has(index);
      add(ok ? 'pass' : 'fail', `index ${tableName}.${index}`, ok ? 'exists' : 'missing');
    }
  }
}

async function checkInstallFlag() {
  try {
    const installed = await SettingsService.getBoolean('system.installed', false);
    add(installed ? 'pass' : 'warn', '安装状态', installed ? 'system.installed=true' : 'system.installed=false');
  } catch (err: any) {
    add('warn', '安装状态', `无法读取 system.installed：${err?.message || err}`);
  }
}

async function checkPayment() {
  const enabled = await SettingsService.getBoolean('wechat_pay.enabled', false);
  if (!enabled) {
    add('warn', '支付开关', 'wechat_pay.enabled=false，只警告，不阻塞运行');
  } else {
    add('pass', '支付开关', '已启用');
  }
}

async function checkProviders() {
  const providers = await query<any>(
    `SELECT id, name, provider_key, provider_type, api_base_url, api_key, status
       FROM ai_model_providers
      ORDER BY id`,
  );
  for (const provider of providers) {
    const active = isEnabled(provider.status);
    const label = `供应商 ${provider.name || provider.provider_key || provider.id}`;
    if (!active) {
      add('warn', label, '已停用，跳过密钥检查');
      continue;
    }

    if (!String(provider.provider_key || '').trim()) {
      add('fail', label, '缺少 code/provider_key');
    } else {
      add('pass', `${label} code`, provider.provider_key);
    }

    if (!String(provider.provider_type || '').trim()) {
      add('fail', label, '缺少 protocol_type/provider_type');
    } else {
      add('pass', `${label} protocol`, provider.provider_type);
    }

    if (!String(provider.api_base_url || '').trim()) {
      add('fail', `${label} Base URL`, '缺少 api_base_url');
    } else {
      add('pass', `${label} Base URL`, '已配置');
    }

    const apiKey = decryptApiKey(String(provider.api_key || ''));
    if (!String(apiKey || '').trim()) {
      const requiredForTier = await providerHasActiveTierBinding(Number(provider.id));
      add('warn', `${label} API Key`, requiredForTier ? 'api_key missing; tiers using this provider are hidden or skipped until configured' : 'api_key missing, but no active tier is bound to this provider');
    } else {
      add('pass', `${label} API Key`, '已配置');
    }
  }
}

async function checkImageAndVideoBindings() {
  const features = await query<any>(
    `SELECT id, feature_key, status
       FROM model_features
      WHERE feature_key IN ('image_create', 'video_create')
      ORDER BY sort_order, id`,
  );
  const featureMap = new Map(features.map((row: any) => [row.feature_key, row]));

  await checkTierFeature('image_create', '生图', ['image_generate'], featureMap.get('image_create'));
  await checkTierFeature('video_create', '生视频', ['text_to_video', 'image_to_video'], featureMap.get('video_create'));
}

async function checkTierFeature(
  featureKey: string,
  label: string,
  expectedCapabilities: readonly string[],
  featureRow: any,
) {
  if (!featureRow) {
    add('fail', `功能 ${featureKey}`, 'model_features 中不存在');
    return;
  }

  const featureEnabled = isEnabled(featureRow.status);
  const tiers = await query<any>(
    `SELECT t.id, t.tier_key, t.tier_name, t.status AS tier_status,
            b.id AS binding_id, b.model_id,
            m.name AS model_name, m.model_type, m.api_model_name, m.upstream_model_code, m.status AS model_status,
            p.name AS provider_name, p.provider_type, p.api_base_url, p.api_key, p.status AS provider_status
       FROM model_tiers t
       LEFT JOIN tier_model_bindings b ON b.tier_id = t.id AND b.binding_type = 'primary'
       LEFT JOIN ai_models m ON m.id = b.model_id
       LEFT JOIN ai_model_providers p ON p.id = m.provider_id
      WHERE t.feature_id = ?
      ORDER BY t.sort_order, t.id`,
    [featureRow.id],
  );

  let enabledTierCount = 0;
  let validTierCount = 0;

  for (const tier of tiers) {
    const tierEnabled = isEnabled(tier.tier_status);
    const tierName = tier.tier_name || tier.tier_key;
    const tierLabel = `${label}档位 ${tierName}`;
    const bindingExists = !!tier.binding_id && !!tier.model_id;

    if (!featureEnabled || !tierEnabled) {
      if (bindingExists) {
        add('warn', tierLabel, `未启用，当前已绑定 ${tier.model_name || '模型'}`);
      } else {
        add('warn', tierLabel, '未启用，未绑定模型也可以');
      }
      continue;
    }

    enabledTierCount += 1;

    if (!bindingExists) {
      add('fail', tierLabel, '已启用但未绑定模型');
      continue;
    }

    if (!isEnabled(tier.model_status) || !isEnabled(tier.provider_status)) {
      add('fail', tierLabel, `已绑定但模型或供应商已停用：${tier.model_name || '未知模型'}`);
      continue;
    }

    const capabilityState = await getModelCapabilitySet(Number(tier.model_id));
    if (!hasAnyCapability(capabilityState.capabilities, expectedCapabilities as string[])) {
      add('fail', tierLabel, `绑定模型缺少 ${expectedCapabilities.join('/')} 能力`);
      continue;
    }

    if (!String(tier.api_base_url || '').trim()) {
      add('warn', tierLabel, '绑定供应商缺少 api_base_url，前台会跳过该绑定');
      continue;
    }

    const apiKey = decryptApiKey(String(tier.api_key || ''));
    if (!String(apiKey || '').trim()) {
      add('warn', tierLabel, '绑定供应商缺少 api_key，前台会跳过该绑定');
      continue;
    }

    validTierCount += 1;
    add('pass', tierLabel, `已绑定 ${tier.model_name || '模型'}`);
  }

  if (featureEnabled && enabledTierCount === 0) {
    add('fail', `${label}功能`, '已启用但没有任何启用中的档位可检查');
  } else if (featureEnabled && validTierCount === 0 && enabledTierCount > 0) {
    add('fail', `${label}功能`, '已启用但没有任何可用的模型绑定');
  }
}

async function checkTextFeatures() {
  for (const feature of TEXT_FEATURES) {
    const enabled = await SettingsService.getBoolean(`ai.${feature.key}.enabled`, false);
    const modelId = parseIntSafe(await SettingsService.getString(`ai.${feature.key}.model_id`, '0'), 0);
    const pointsCost = parseIntSafe(await SettingsService.getString(`ai.${feature.key}.points_cost`, '0'), 0);

    if (!enabled) {
      if (modelId > 0) {
        add('warn', `文本功能 ${feature.key}`, `功能未启用，但已配置 model_id=${modelId}`);
      } else {
        add('warn', `文本功能 ${feature.key}`, '功能未启用');
      }
      continue;
    }

    if (!modelId) {
      add('fail', `文本功能 ${feature.key}`, '已启用但未绑定默认文本模型');
      continue;
    }

    const model = await queryOne<any>(
      `SELECT m.id, m.name, m.display_name, m.model_type, m.api_model_name, m.upstream_model_code,
              m.status AS model_status, p.id AS provider_id, p.name AS provider_name, p.provider_key,
              p.provider_type, p.api_base_url, p.api_key, p.status AS provider_status
         FROM ai_models m
         JOIN ai_model_providers p ON p.id = m.provider_id
        WHERE m.id = ?
        LIMIT 1`,
      [modelId],
    );

    if (!model) {
      add('fail', `文本功能 ${feature.key}`, '绑定模型不存在或已停用');
      continue;
    }

    if (!isEnabled(model.model_status) || !isEnabled(model.provider_status)) {
      add('fail', `文本功能 ${feature.key}`, `模型或供应商已停用：${model.display_name || model.name}`);
      continue;
    }

    if (String(model.model_type || '').trim().toLowerCase() !== 'text') {
      add('fail', `文本功能 ${feature.key}`, `绑定了错误类型模型：${model.display_name || model.name}`);
      continue;
    }

    if (!String(model.api_base_url || '').trim()) {
      add('fail', `文本功能 ${feature.key}`, '绑定供应商缺少 api_base_url');
      continue;
    }

    const apiKey = decryptApiKey(String(model.api_key || ''));
    if (!String(apiKey || '').trim()) {
      add('fail', `文本功能 ${feature.key}`, '绑定供应商缺少 api_key');
      continue;
    }

    if (!String(model.api_model_name || model.upstream_model_code || '').trim()) {
      add('fail', `文本功能 ${feature.key}`, '绑定模型缺少 model_code/api_model_name');
      continue;
    }

    const capabilityState = await getModelCapabilitySet(Number(model.id));
    if (!hasAnyCapability(capabilityState.capabilities, feature.capabilities as string[])) {
      add('fail', `文本功能 ${feature.key}`, `绑定模型缺少 ${feature.capabilities.join('/')} 能力`);
      continue;
    }

    add('pass', `文本功能 ${feature.key}`, `已绑定 ${model.display_name || model.name}，积分 ${pointsCost}`);
  }
}

async function main() {
  try {
    await checkTables();
    await checkColumns();
    await checkIndexes();
    await checkInstallFlag();
    await checkPayment();
    await checkProviders();
    await checkImageAndVideoBindings();
    await checkTextFeatures();
  } catch (err: any) {
    add('fail', '运行检查', err?.message || String(err));
  } finally {
    await pool.end().catch(() => undefined);
  }

  printSummary();
}

function printSummary() {
  for (const item of results) {
    console.log(`${icon(item.status)} ${item.name}: ${item.message}`);
  }

  const passed = results.filter(item => item.status === 'pass').length;
  const warnings = results.filter(item => item.status === 'warn').length;
  const failed = results.filter(item => item.status === 'fail').length;

  console.log('');
  console.log(`总检查项: ${results.length}`);
  console.log(`通过: ${passed}`);
  console.log(`警告: ${warnings}`);
  console.log(`失败: ${failed}`);

  if (failed > 0) process.exitCode = 1;
}

main().catch(err => {
  add('fail', '运行检查', err?.message || String(err));
  printSummary();
});
