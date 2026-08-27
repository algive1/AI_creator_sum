import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('creation workspace migration is idempotent and backfills projects and assets', async () => {
  const migration = await read('../src/migrations/20260803_001_creation_workspace.sql');
  for (const table of ['creation_projects', 'media_assets', 'task_asset_inputs', 'task_quotes']) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(migration, /COLUMN_NAME = 'project_id'/);
  assert.match(migration, /COLUMN_NAME = 'client_request_id'/);
  assert.match(migration, /uk_task_user_client_request/);
  assert.match(migration, /未归类项目/);
  assert.match(migration, /INSERT IGNORE INTO media_assets/);
  assert.match(migration, /source_output_id/);
});

test('desktop and web task creation require quote and idempotency contracts', async () => {
  const [routes, quote, task] = await Promise.all([
    read('../src/routes/tasks.ts'),
    read('../src/services/task-quote.service.ts'),
    read('../src/services/task.service.ts'),
  ]);
  assert.match(routes, /router\.post\('\/quote'/);
  assert.match(routes, /Idempotency-Key/);
  assert.match(routes, /quoteId/);
  assert.ok(routes.includes("router.post('/:id(\\\\d+)/retry'"));
  assert.match(quote, /validateQuoteAssets/);
  assert.match(quote, /request_hash/);
  assert.match(quote, /featureKey: body\.featureKey/);
  assert.match(quote, /params: stableValue\(body\.params \|\| \{\}\)/);
  assert.match(task, /client_request_id/);
  assert.match(task, /source_task_id/);
  assert.match(task, /task_asset_inputs/);
});

test('durable queue messages contain task ids and BullMQ uses the task id as job id', async () => {
  const [queue, tasks] = await Promise.all([
    read('../src/services/task-queue.service.ts'),
    read('../src/services/task.service.ts'),
  ]);
  assert.match(queue, /new Queue\(queueName/);
  assert.match(queue, /new Worker\(/);
  assert.match(queue, /function jobIdForTask\(taskId: number\): string/);
  assert.match(queue, /queue\.add\('ai-task', \{ taskId \}, \{ jobId: jobIdForTask\(taskId\) \}\)/);
  assert.match(queue, /attempts: MAX_ATTEMPTS/);
  assert.match(queue, /type: 'exponential'/);
  assert.match(tasks, /recoverStaleAiTasks\(\)/);
  assert.match(tasks, /queued_at = NOW\(3\)/);
  assert.doesNotMatch(tasks, /stale_queue_timeout/);
});

test('auth supports HttpOnly refresh cookies and encrypted desktop token transport', async () => {
  const auth = await read('../src/routes/auth.ts');
  assert.match(auth, /HttpOnly/);
  assert.match(auth, /SameSite=Lax/);
  assert.match(auth, /req\.body\?\.clientType === 'app'/);
  assert.match(auth, /tokenTransport === 'cookie'/);
});

test('asset cleanup preserves shared files and batch favorites require a boolean', async () => {
  const [assets, routes] = await Promise.all([
    read('../src/services/media-asset.service.ts'),
    read('../src/routes/assets.ts'),
  ]);
  assert.match(assets, /WHERE file_id = \? AND id <> \?/);
  assert.match(assets, /!hasOtherAssetReference && asset\.storage_key/);
  assert.match(routes, /typeof req\.body\?\.isFavorite !== 'boolean'/);
});
