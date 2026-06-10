import dotenv from 'dotenv';
import path from 'node:path';
import axios from 'axios';
import mysql from 'mysql2/promise';
import { executeInit, saveSystemConfig, setTempDbConfigForCheck, validateAdmin } from '../src/services/install.service';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUCCESS_RESULT_URL = process.env.CHECK_TASK_OUTPUT_RESULT_URL || 'https://httpbin.org/image/png';

const cfg = {
  host: process.env.CHECK_DB_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.CHECK_DB_PORT || process.env.DB_PORT || '3306', 10),
  database: process.env.CHECK_DB_NAME || 'ai_creator_task_output_check',
  user: process.env.CHECK_DB_USER || process.env.DB_USER || 'root',
  password: process.env.CHECK_DB_PASSWORD || process.env.DB_PASSWORD || '',
  prefix: '',
  autoCreate: true,
};

let dbPool: { end: () => Promise<void> } | null = null;
let fakeUploadFails = false;

function assert(condition: any, message: string): void {
  if (!condition) throw new Error(message);
}

async function assertEqual(label: string, actual: any, expected: any): Promise<void> {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

async function assertDownload200(url: string): Promise<void> {
  const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000, validateStatus: () => true });
  assert(resp.status >= 200 && resp.status < 300, `download failed: ${url} HTTP ${resp.status}`);
  assert(Buffer.byteLength(resp.data) > 0, `download returned empty body: ${url}`);
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function patchStorageService(): Promise<void> {
  const { StorageService } = await import('../src/services/storage/storage.service');
  const fakeAdapter = {
    provider: 'mock_https_cdn',
    async upload(_key: string, body: Buffer) {
      if (fakeUploadFails) throw new Error('mock upload failed');
      assert(body.length > 0, 'mock upload received empty buffer');
      return { url: SUCCESS_RESULT_URL, cdnUrl: SUCCESS_RESULT_URL, etag: 'mock-etag' };
    },
    async uploadLarge(_key: string, stream: NodeJS.ReadableStream) {
      if (fakeUploadFails) throw new Error('mock upload failed');
      const body = await streamToBuffer(stream);
      assert(body.length > 0, 'mock uploadLarge received empty stream');
      return { url: SUCCESS_RESULT_URL, cdnUrl: SUCCESS_RESULT_URL, etag: 'mock-etag' };
    },
    async delete() {
      return undefined;
    },
    getAccessUrl(_key: string) {
      return SUCCESS_RESULT_URL;
    },
    getCdnUrl(_key: string) {
      return SUCCESS_RESULT_URL;
    },
    async generateCredential(options: any) {
      return {
        provider: 'mock_https_cdn',
        storageKey: options.storageKey,
        uploadUrl: SUCCESS_RESULT_URL,
        cdnUrl: SUCCESS_RESULT_URL,
        credential: {},
        expireAt: Math.floor(Date.now() / 1000) + 3600,
      };
    },
  };

  (StorageService.getActiveProvider as any) = () => 'tencent_cos';
  (StorageService.getActiveAdapter as any) = () => fakeAdapter;
  StorageService.resetAdapter();
}

async function prepareDatabase(): Promise<{ db: typeof import('../src/utils/db'); taskService: typeof import('../src/services/task.service'); userId: number; imageModelId: number; imageTier: any }> {
  if (cfg.database === process.env.DB_NAME) throw new Error('CHECK_DB_NAME cannot equal DB_NAME');

  const root = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password });
  await root.query(`DROP DATABASE IF EXISTS ${mysql.escapeId(cfg.database)}`);
  await root.query(`CREATE DATABASE ${mysql.escapeId(cfg.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.end();

  setTempDbConfigForCheck(cfg);
  await saveSystemConfig({ siteName: 'AI Creator Task Output Check', adminPath: 'admin', timezone: 'Asia/Shanghai', storageType: 'local', debugMode: true, allowRegister: true });
  const admin = await validateAdmin({ username: 'task_output_admin', password: 'Admin12345', confirmPassword: 'Admin12345' });
  if (!admin.valid) throw new Error(admin.error || 'admin validation failed');
  const init = await executeInit();
  if (!init.success) throw new Error(JSON.stringify(init.steps, null, 2));

  process.env.DB_HOST = cfg.host;
  process.env.DB_PORT = String(cfg.port);
  process.env.DB_USER = cfg.user;
  process.env.DB_PASSWORD = cfg.password;
  process.env.DB_NAME = cfg.database;
  process.env.NODE_ENV = 'development';
  process.env.CHECK_DISABLE_QUEUE = 'true';
  process.env.TASK_OUTPUT_VERIFY_DELIVERY = 'false';

  const configModule = await import('../src/utils/config');
  configModule.config.db.host = cfg.host;
  configModule.config.db.port = cfg.port;
  configModule.config.db.user = cfg.user;
  configModule.config.db.password = cfg.password;
  configModule.config.db.database = cfg.database;

  const db = await import('../src/utils/db');
  db.resetDbPool();
  dbPool = { end: db.endDbPool };
  await patchStorageService();
  const taskService = await import('../src/services/task.service');

  const [userResult] = await db.query<any>(
    "INSERT INTO users (openid, nickname, status, created_at, updated_at) VALUES ('check_task_output_user', '任务结果测试用户', 'normal', NOW(3), NOW(3))",
  );
  const userId = (userResult as any).insertId;
  await db.query('INSERT INTO point_accounts (user_id, balance, total_earned, frozen_balance, version) VALUES (?, 100, 100, 0, 1)', [userId]);
  await db.query('INSERT INTO user_assets (user_id, points_balance, total_points_earned) VALUES (?, 100, 100)', [userId]);

  const [providerResult] = await db.query<any>(
    `INSERT INTO ai_model_providers
     (name, provider_key, provider_type, api_base_url, api_key, default_timeout, default_retry, status, created_at)
     VALUES ('Check Provider', 'check_task_output_provider', 'custom', 'https://example.com/api', 'check-api-key', 120, 3, 'active', NOW(3))`,
  );
  const providerId = (providerResult as any).insertId;
  const [imageModelResult] = await db.query<any>(
    `INSERT INTO ai_models
     (provider_id, name, display_name, model_type, sub_type, api_model_name, upstream_model_code, is_async, query_task_url,
      request_template, result_path, status_mapping, error_mapping, timeout_seconds, retry_times, retry_delay_ms,
      daily_limit, daily_limit_per_user, max_concurrency, priority, sort_order, remark, status)
     VALUES (?, 'check-output-image-model', '测试结果图片模型', 'image', 'text2img', 'check-image', 'check-image', 0, '',
      '{}', '', '{}', '{}', 120, 0, 100, 0, 0, 5, 10, 0, '', 'active')`,
    [providerId],
  );
  const imageModelId = (imageModelResult as any).insertId;
  const imageTier = await db.queryOne<any>("SELECT id, points_cost FROM model_tiers WHERE tier_key = 'image_standard'");
  if (!imageTier) throw new Error('missing image_standard tier');
  await db.query('DELETE FROM tier_model_bindings WHERE tier_id = ?', [imageTier.id]);
  await db.query(
    "INSERT INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order) VALUES (?, ?, 'primary', 0)",
    [imageTier.id, imageModelId],
  );

  return { db, taskService, userId, imageModelId, imageTier };
}

async function runSuccessCase(ctx: Awaited<ReturnType<typeof prepareDatabase>>): Promise<any> {
  fakeUploadFails = false;
  const { db, taskService, userId, imageModelId, imageTier } = ctx;
  const created = await taskService.createImageTask({
    userId,
    subType: 'text2img',
    prompt: '模拟上游返回图片结果',
    tierKey: 'image_standard',
  });
  await taskService.saveTaskOutputWithRetry({
    taskId: created.taskId,
    userId,
    url: SUCCESS_RESULT_URL,
    index: 0,
    outputType: 'image',
    prompt: '模拟上游返回图片结果',
    metadata: { providerStatus: 'success' },
    params: { platformWatermarkEnabled: false },
  });
  await taskService.finalizeTaskSuccess({
    taskId: created.taskId,
    pointsCost: created.pointsCost,
    actualModelId: imageModelId,
    costSnapshot: { check: true },
  });

  const detail = await taskService.getTaskById(created.taskId, userId);
  const output = detail?.outputs?.[0];
  assert(detail?.status === 'completed', `success task status should be completed, got ${detail?.status}`);
  assert(output?.url?.startsWith('https://'), `output.url should be https, got ${output?.url}`);
  assert(output?.image?.startsWith('https://'), `output.image should be https, got ${output?.image}`);
  assert(output?.thumbnail?.startsWith('https://'), `output.thumbnail should be https, got ${output?.thumbnail}`);
  await assertDownload200(output.url);

  const account = await db.queryOne<any>('SELECT balance, frozen_balance, total_spent FROM point_accounts WHERE user_id = ?', [userId]);
  await assertEqual('success frozen_balance', account?.frozen_balance, 0);
  await assertEqual('success total_spent', account?.total_spent, imageTier.points_cost);
  return detail;
}

async function runFailureCase(ctx: Awaited<ReturnType<typeof prepareDatabase>>): Promise<any> {
  fakeUploadFails = true;
  const { db, taskService, userId } = ctx;
  const before = await db.queryOne<any>('SELECT balance, frozen_balance FROM point_accounts WHERE user_id = ?', [userId]);
  const created = await taskService.createImageTask({
    userId,
    subType: 'text2img',
    prompt: '模拟转存失败',
    tierKey: 'image_standard',
  });
  try {
    await taskService.saveTaskOutputWithRetry({
      taskId: created.taskId,
      userId,
      url: SUCCESS_RESULT_URL,
      index: 0,
      outputType: 'image',
      prompt: '模拟转存失败',
      params: { platformWatermarkEnabled: false },
      metadata: { providerStatus: 'success' },
    });
    throw new Error('transfer failure was not raised');
  } catch (err: any) {
    if (!/mock upload failed/.test(err.message || '')) throw err;
    await taskService.finalizeTaskFailure(created.taskId, created.pointsCost, err.message);
  } finally {
    fakeUploadFails = false;
  }

  const detail = await taskService.getTaskById(created.taskId, userId);
  const outputCount = await db.queryOne<any>('SELECT COUNT(*) AS cnt FROM ai_task_outputs WHERE task_id = ?', [created.taskId]);
  const after = await db.queryOne<any>('SELECT balance, frozen_balance FROM point_accounts WHERE user_id = ?', [userId]);
  assert(detail?.status === 'failed', `failure task status should be failed, got ${detail?.status}`);
  await assertEqual('failure output count', Number(outputCount?.cnt || 0), 0);
  await assertEqual('failure balance refunded', after?.balance, before?.balance);
  await assertEqual('failure frozen refunded', after?.frozen_balance, before?.frozen_balance);
  return detail;
}

async function main(): Promise<void> {
  await assertDownload200(SUCCESS_RESULT_URL);
  const ctx = await prepareDatabase();
  const successDetail = await runSuccessCase(ctx);
  const failedDetail = await runFailureCase(ctx);
  const evidence = {
    successTask: {
      taskId: successDetail.taskId,
      status: successDetail.status,
      outputs: successDetail.outputs,
      thumbnail: successDetail.thumbnail,
      coverUrl: successDetail.coverUrl,
    },
    failedTask: {
      taskId: failedDetail.taskId,
      status: failedDetail.status,
      outputs: failedDetail.outputs,
      pointsRefunded: failedDetail.pointsRefunded,
      failReason: failedDetail.failReason,
    },
  };
  console.log(JSON.stringify(evidence, null, 2));
  console.log('check:task-output-delivery passed');
}

main()
  .catch(err => {
    console.error('check:task-output-delivery failed:', err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (dbPool) await dbPool.end();
  });
