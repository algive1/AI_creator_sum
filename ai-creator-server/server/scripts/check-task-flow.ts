import dotenv from 'dotenv';
import path from 'path';
import mysql from 'mysql2/promise';
import { executeInit, saveSystemConfig, setTempDbConfigForCheck, validateAdmin } from '../src/services/install.service';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
let dbPool: { end: () => Promise<void> } | null = null;

const cfg = {
  host: process.env.CHECK_DB_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.CHECK_DB_PORT || process.env.DB_PORT || '3306', 10),
  database: process.env.CHECK_DB_NAME || 'ai_creator_task_flow_check',
  user: process.env.CHECK_DB_USER || process.env.DB_USER || 'root',
  password: process.env.CHECK_DB_PASSWORD || process.env.DB_PASSWORD || '',
  prefix: '',
  autoCreate: true,
};

function parseJson(value: any, fallback: any = {}) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

async function assertEqual(label: string, actual: any, expected: any) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

async function main() {
  if (cfg.database === process.env.DB_NAME) throw new Error('CHECK_DB_NAME 不能等于正式 DB_NAME');

  const root = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password });
  await root.query(`DROP DATABASE IF EXISTS ${mysql.escapeId(cfg.database)}`);
  await root.query(`CREATE DATABASE ${mysql.escapeId(cfg.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.end();

  setTempDbConfigForCheck(cfg);
  await saveSystemConfig({ siteName: 'AI Creator Task Flow Check', adminPath: 'admin', timezone: 'Asia/Shanghai', storageType: 'local', debugMode: true, allowRegister: true });
  const admin = await validateAdmin({ username: 'task_flow_admin', password: 'Admin12345', confirmPassword: 'Admin12345' });
  if (!admin.valid) throw new Error(admin.error || '管理员校验失败');
  const init = await executeInit();
  if (!init.success) throw new Error(JSON.stringify(init.steps, null, 2));

  process.env.DB_HOST = cfg.host;
  process.env.DB_PORT = String(cfg.port);
  process.env.DB_USER = cfg.user;
  process.env.DB_PASSWORD = cfg.password;
  process.env.DB_NAME = cfg.database;
  process.env.NODE_ENV = 'development';
  process.env.CHECK_DISABLE_QUEUE = 'true';

  const configModule = await import('../src/utils/config');
  configModule.config.db.host = cfg.host;
  configModule.config.db.port = cfg.port;
  configModule.config.db.user = cfg.user;
  configModule.config.db.password = cfg.password;
  configModule.config.db.database = cfg.database;

  const db = await import('../src/utils/db');
  db.resetDbPool();
  dbPool = { end: db.endDbPool };
  const taskService = await import('../src/services/task.service');

  const [userResult] = await db.query<any>(
    "INSERT INTO users (openid, nickname, status, created_at, updated_at) VALUES ('check_task_flow_user', '任务链路测试用户', 'normal', NOW(3), NOW(3))",
  );
  const userId = (userResult as any).insertId;
  await db.query('INSERT INTO point_accounts (user_id, balance, total_earned, frozen_balance, version) VALUES (?, 100, 100, 0, 1)', [userId]);
  await db.query('INSERT INTO user_assets (user_id, points_balance, total_points_earned) VALUES (?, 100, 100)', [userId]);

  const [providerResult] = await db.query<any>(
    `INSERT INTO ai_model_providers
     (name, provider_key, provider_type, api_base_url, api_key, default_timeout, default_retry, status, created_at)
     VALUES ('Check Provider', 'check_provider', 'custom', 'https://example.com/api', 'check-api-key', 120, 3, 'active', NOW(3))`,
  );
  const providerId = (providerResult as any).insertId;

  const [imageModelResult] = await db.query<any>(
    `INSERT INTO ai_models
     (provider_id, name, display_name, model_type, sub_type, api_model_name, upstream_model_code, is_async, query_task_url,
      request_template, result_path, status_mapping, error_mapping, timeout_seconds, retry_times, retry_delay_ms,
      daily_limit, daily_limit_per_user, max_concurrency, priority, sort_order, remark, status)
     VALUES (?, 'check-image-model', '测试图片模型', 'image', 'text2img', 'check-image', 'check-image', 0, '',
      '{}', '', '{}', '{}', 120, 0, 100, 0, 0, 5, 10, 0, '', 'active')`,
    [providerId],
  );
  const imageModelId = (imageModelResult as any).insertId;

  const [videoModelResult] = await db.query<any>(
    `INSERT INTO ai_models
     (provider_id, name, display_name, model_type, sub_type, api_model_name, upstream_model_code, is_async, query_task_url,
      request_template, result_path, status_mapping, error_mapping, timeout_seconds, retry_times, retry_delay_ms,
      daily_limit, daily_limit_per_user, max_concurrency, priority, sort_order, remark, status)
     VALUES (?, 'check-video-model', '测试视频模型', 'video', 'text2video', 'check-video', 'check-video', 0, '',
      '{}', '', '{}', '{}', 120, 0, 100, 0, 0, 5, 10, 0, '', 'active')`,
    [providerId],
  );
  const videoModelId = (videoModelResult as any).insertId;

  const imageTier = await db.queryOne<any>("SELECT id, points_cost FROM model_tiers WHERE tier_key = 'image_standard'");
  const videoTier = await db.queryOne<any>("SELECT id, points_cost FROM model_tiers WHERE tier_key = 'video_standard'");
  if (!imageTier || !videoTier) throw new Error('缺少默认 image_standard 或 video_standard 档位');

  await db.query('DELETE FROM tier_model_bindings WHERE tier_id IN (?, ?)', [imageTier.id, videoTier.id]);
  await db.query(
    "INSERT INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order) VALUES (?, ?, 'primary', 0)",
    [imageTier.id, imageModelId],
  );
  await db.query(
    "INSERT INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order) VALUES (?, ?, 'primary', 0)",
    [videoTier.id, videoModelId],
  );

  const imageTask = await taskService.createImageTask({
    userId,
    subType: 'text2img',
    prompt: '生成一张320×100像素的电商横幅',
    ratio: '9:16',
    tierKey: 'image_standard',
  });
  await assertEqual('image pointsCost', imageTask.pointsCost, imageTier.points_cost);

  const imageRow = await db.queryOne<any>('SELECT tier_id, model_id, points_cost FROM ai_tasks WHERE id = ?', [imageTask.taskId]);
  await assertEqual('image task tier_id', imageRow?.tier_id, imageTier.id);
  await assertEqual('image task model_id', imageRow?.model_id, imageModelId);

  const imageInput = await db.queryOne<any>('SELECT params FROM ai_task_inputs WHERE task_id = ?', [imageTask.taskId]);
  const imageParams = parseJson(imageInput?.params);
  await assertEqual('image size width', imageParams.sizePlan?.targetWidth, 320);
  await assertEqual('image size height', imageParams.sizePlan?.targetHeight, 100);
  await assertEqual('image size conflict', imageParams.sizePlan?.conflict, true);

  let account = await db.queryOne<any>('SELECT balance, frozen_balance FROM point_accounts WHERE user_id = ?', [userId]);
  await assertEqual('balance after image freeze', account?.balance, 100 - imageTier.points_cost);
  await assertEqual('frozen after image freeze', account?.frozen_balance, imageTier.points_cost);

  await taskService.taskTestHooks.refundPointsForCheck(imageTask.taskId, imageTask.pointsCost);
  await taskService.taskTestHooks.refundPointsForCheck(imageTask.taskId, imageTask.pointsCost);
  account = await db.queryOne<any>('SELECT balance, frozen_balance, total_refunded FROM point_accounts WHERE user_id = ?', [userId]);
  await assertEqual('balance after idempotent refund', account?.balance, 100);
  await assertEqual('frozen after idempotent refund', account?.frozen_balance, 0);
  await assertEqual('total_refunded after idempotent refund', account?.total_refunded, imageTier.points_cost);

  const settleTask = await taskService.createImageTask({
    userId,
    subType: 'text2img',
    prompt: '生成一张320×100像素的电商横幅',
    ratio: '9:16',
    tierKey: 'image_standard',
  });
  await taskService.taskTestHooks.settlePointsForCheck(settleTask.taskId, settleTask.pointsCost);
  await taskService.taskTestHooks.settlePointsForCheck(settleTask.taskId, settleTask.pointsCost);
  account = await db.queryOne<any>('SELECT balance, frozen_balance, total_spent FROM point_accounts WHERE user_id = ?', [userId]);
  await assertEqual('balance after idempotent settle', account?.balance, 100 - imageTier.points_cost);
  await assertEqual('frozen after idempotent settle', account?.frozen_balance, 0);
  await assertEqual('total_spent after idempotent settle', account?.total_spent, imageTier.points_cost);

  const videoTask = await taskService.createVideoTask({
    userId,
    subType: 'text2video',
    prompt: '生成一条产品展示短视频',
    tierKey: 'video_standard',
    params: { duration: '5s', ratio: '9:16' },
  });
  await assertEqual('video pointsCost', videoTask.pointsCost, videoTier.points_cost);
  const videoRow = await db.queryOne<any>('SELECT tier_id, model_id FROM ai_tasks WHERE id = ?', [videoTask.taskId]);
  await assertEqual('video task tier_id', videoRow?.tier_id, videoTier.id);
  await assertEqual('video task model_id', videoRow?.model_id, videoModelId);

  try {
    await taskService.createVideoTask({ userId, subType: 'text2video', prompt: 'test', tierKey: 'video_standard', modelId: videoModelId });
    throw new Error('video modelId 未被拒绝');
  } catch (err: any) {
    if (!/真实模型/.test(err.message || '')) throw err;
  }

  console.log('check:task-flow passed');
}

main()
  .catch(err => {
    console.error('check:task-flow failed:', err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (dbPool) await dbPool.end();
  });
