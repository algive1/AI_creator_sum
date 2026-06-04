import { query, queryOne } from '../utils/db';
import { parseJson } from '../utils/content-helpers';
import { AdapterRegistry } from './adapters/adapter.registry';
import { decryptApiKey } from './openai-adapter.service';
import {
  addTaskLog,
  finalizeTaskFailure,
  finalizeTaskSuccess,
  positiveInt,
  saveTaskOutput,
} from './task.service';

type ProviderInternalStatus = 'processing' | 'completed' | 'failed';

let schedulerStarted = false;
let schedulerTimer: NodeJS.Timeout | null = null;
let scanRunning = false;

export function startVideoPollingScheduler(): void {
  if (schedulerStarted || process.env.CHECK_DISABLE_VIDEO_POLLING === 'true') return;
  schedulerStarted = true;
  const intervalSeconds = positiveInt(process.env.VIDEO_TASK_POLL_INTERVAL_SECONDS, 20);

  recoverProcessingVideoTasksOnStartup()
    .catch(err => console.error('[VideoPolling] startup recovery failed:', err.message || err));

  schedulerTimer = setInterval(() => {
    scanAndPollVideoTasks().catch(err => console.error('[VideoPolling] scan failed:', err.message || err));
  }, intervalSeconds * 1000);
  schedulerTimer.unref?.();
}

export async function recoverProcessingVideoTasksOnStartup(): Promise<{ recovered: number; failed: number }> {
  const maxRunningMinutes = positiveInt(process.env.VIDEO_TASK_MAX_RUNNING_MINUTES, 30);
  const intervalSeconds = positiveInt(process.env.VIDEO_TASK_POLL_INTERVAL_SECONDS, 20);
  const tasks = await query<any>(
    `SELECT id, task_type, points_cost, provider_started_at, started_at, updated_at, created_at, provider_task_id
       FROM ai_tasks
      WHERE task_type IN ('image', 'video') AND status = 'processing'
      ORDER BY created_at ASC
      LIMIT 200`,
  );

  let recovered = 0;
  let failed = 0;
  const now = Date.now();
  for (const task of tasks) {
    try {
      const startedAt = new Date(task.provider_started_at || task.started_at || task.updated_at || task.created_at).getTime();
      const runningMinutes = Number.isFinite(startedAt) ? (now - startedAt) / 60000 : 0;
      if (!task.provider_task_id) {
        const staleMinutes = positiveInt(process.env.VIDEO_TASK_STALE_PROCESSING_MINUTES, 45);
        if (runningMinutes >= staleMinutes) {
          const label = task.task_type === 'video' ? 'Video' : 'Image';
          await finalizeTaskFailure(task.id, task.points_cost || 0, `${label} task was not submitted to provider; points refunded.`);
          failed++;
        }
        continue;
      }
      if (runningMinutes >= maxRunningMinutes) {
        await finalizeTaskFailure(task.id, task.points_cost || 0, 'Provider task polling timed out after service restart; points refunded.');
        failed++;
        continue;
      }
      await query(
        `UPDATE ai_tasks
            SET next_poll_at = COALESCE(next_poll_at, DATE_ADD(NOW(3), INTERVAL ? SECOND)),
                processing_lock_until = NULL, updated_at = NOW(3)
          WHERE id = ? AND status = 'processing'`,
        [Math.min(intervalSeconds, 5), task.id],
      );
      await addTaskLog(task.id, 'provider_poll_recovered', 'Provider polling resumed after service restart.');
      recovered++;
    } catch (err: any) {
      failed++;
      await addTaskLog(task.id, 'provider_poll_recover_failed', (err.message || 'Provider polling recovery failed').substring(0, 500)).catch(() => undefined);
    }
  }
  return { recovered, failed };
}

export async function scanAndPollVideoTasks(): Promise<{ polled: number; failed: number }> {
  if (scanRunning) return { polled: 0, failed: 0 };
  scanRunning = true;
  try {
    await failStaleVideoTasks();
    const batchSize = positiveInt(process.env.VIDEO_TASK_POLL_BATCH_SIZE, 10);
    const tasks = await query<any>(
      `SELECT id
         FROM ai_tasks
        WHERE task_type IN ('image', 'video')
          AND status = 'processing'
          AND provider_task_id IS NOT NULL
          AND (next_poll_at IS NULL OR next_poll_at <= NOW(3))
          AND (processing_lock_until IS NULL OR processing_lock_until < NOW(3))
        ORDER BY COALESCE(next_poll_at, created_at) ASC
        LIMIT ${batchSize}`,
    );

    let polled = 0;
    let failed = 0;
    for (const task of tasks) {
      try {
        await pollSingleVideoTask(task.id);
        polled++;
      } catch (err: any) {
        failed++;
        await addTaskLog(task.id, 'provider_poll_error', (err.message || 'Provider polling failed').substring(0, 500)).catch(() => undefined);
      }
    }
    return { polled, failed };
  } finally {
    scanRunning = false;
  }
}

export async function pollSingleVideoTask(taskId: number): Promise<void> {
  const lockMinutes = 2;
  const [lockResult]: any = await query(
    `UPDATE ai_tasks
        SET processing_lock_until = DATE_ADD(NOW(3), INTERVAL ${lockMinutes} MINUTE)
      WHERE id = ?
        AND task_type IN ('image', 'video')
        AND status = 'processing'
        AND provider_task_id IS NOT NULL
        AND (processing_lock_until IS NULL OR processing_lock_until < NOW(3))`,
    [taskId],
  );
  if (!lockResult?.affectedRows) return;

  try {
    const task = await loadVideoPollingTask(taskId);
    if (!task) return;
    const modelConfig = parseJson(task.model_config, {});
    const maxRunningMinutes = modelConfig.max_polling_minutes
      || positiveInt(process.env.VIDEO_TASK_MAX_RUNNING_MINUTES, 30);
    const maxPollCount = modelConfig.max_polling_minutes
      ? Math.ceil((modelConfig.max_polling_minutes * 60) / positiveInt(process.env.VIDEO_TASK_POLL_INTERVAL_SECONDS, 20))
      : positiveInt(process.env.VIDEO_TASK_MAX_POLL_COUNT, 120);
    const startedAt = new Date(task.provider_started_at || task.started_at || task.created_at).getTime();
    if (Number.isFinite(startedAt) && Date.now() - startedAt > maxRunningMinutes * 60 * 1000) {
      await finalizeVideoFailure(task, 'Provider task polling timed out; points refunded.');
      return;
    }
    if ((task.poll_count || 0) >= maxPollCount) {
      await finalizeVideoFailure(task, 'Provider task polling count exceeded; points refunded.');
      return;
    }

    const adapter = AdapterRegistry.get(task.provider_type || 'openai');
    if (!adapter) throw new Error('Unsupported provider: ' + (task.provider_type || 'unknown'));
    const providerResult = await adapter.queryTask(task.provider_task_id, {
      baseUrl: task.provider_api_base_url || '',
      apiKey: decryptApiKey(task.provider_api_key || ''),
      timeout: 30000,
      authType: 'bearer',
      queryTaskUrl: task.query_task_url || undefined,
    });
    const mapped = normalizeProviderStatus(adapter.mapStatus(providerResult.status, parseJson(task.status_mapping, {})));
    const message = safeProviderMessage(providerResult.error?.message || providerResult.status || mapped);
    const nextProgress = estimateVideoProgress(task.poll_count + 1, providerResult.status, mapped);

    await query(
      `UPDATE ai_tasks
          SET provider_status = ?, provider_status_message = ?, poll_count = poll_count + 1,
              last_polled_at = NOW(3), progress = GREATEST(progress, ?), updated_at = NOW(3)
        WHERE id = ? AND status = 'processing'`,
      [String(providerResult.status || mapped).substring(0, 64), message, nextProgress, task.id],
    );
    await addTaskLog(task.id, 'provider_task_poll', `Provider status: ${String(providerResult.status || mapped).substring(0, 64)}`);

    if (mapped === 'completed') {
      await finalizeVideoSuccess(task, providerResult);
      return;
    }
    if (mapped === 'failed') {
      await finalizeVideoFailure(task, providerResult.error?.message || 'Provider task failed; points refunded.');
      return;
    }

    const intervalSeconds = positiveInt(process.env.VIDEO_TASK_POLL_INTERVAL_SECONDS, 20);
    await query(
      `UPDATE ai_tasks
          SET next_poll_at = DATE_ADD(NOW(3), INTERVAL ? SECOND), processing_lock_until = NULL
        WHERE id = ? AND status = 'processing'`,
      [intervalSeconds, task.id],
    );
  } catch (err) {
    await query('UPDATE ai_tasks SET processing_lock_until = NULL WHERE id = ? AND status = ?', [taskId, 'processing']).catch(() => undefined);
    throw err;
  }
}

async function finalizeVideoSuccess(task: any, providerResult: any): Promise<void> {
  const urls = providerResult.result?.urls || [];
  if (!urls.length) {
    await finalizeVideoFailure(task, providerResult.error?.message || 'Provider returned success but no usable result; points refunded.');
    return;
  }
  await query("UPDATE ai_tasks SET progress = GREATEST(progress, 85), current_step = '保存结果', updated_at = NOW(3) WHERE id = ? AND status = 'processing'", [task.id]);
  const outputType = task.task_type === 'video' ? 'video' : 'image';
  const params = parseJson(task.params, {});
  try {
    for (let i = 0; i < urls.length; i++) {
      await saveTaskOutput({
        taskId: task.id,
        userId: task.user_id,
        url: urls[i],
        index: i,
        outputType,
        prompt: task.prompt || '',
        params,
        sizePlan: params.sizePlan,
        metadata: providerResult.result?.metadata || {},
      });
    }
  } catch (err: any) {
    await finalizeVideoFailure(task, err.message || 'Output transfer failed; points refunded.');
    return;
  }
  const doneMessage = outputType === 'video' ? 'Video output saved.' : 'Image output saved.';
  await query("UPDATE ai_tasks SET provider_status = 'completed', provider_status_message = ?, progress = GREATEST(progress, 90), updated_at = NOW(3) WHERE id = ?", [doneMessage, task.id]);
  await finalizeTaskSuccess({
    taskId: task.id,
    pointsCost: task.points_cost || 0,
    actualModelId: task.actual_model_id || task.model_id || 0,
    costSnapshot: providerResult.cost || {},
  });
}

async function finalizeVideoFailure(task: any, reason: string): Promise<void> {
  const fallback = task.task_type === 'video' ? 'Video generation failed; points refunded.' : 'Image generation failed; points refunded.';
  const safeReason = safeProviderMessage(reason || fallback);
  await query(
    `UPDATE ai_tasks
        SET provider_status = COALESCE(provider_status, 'failed'), provider_status_message = ?
      WHERE id = ? AND status = 'processing'`,
    [safeReason, task.id],
  );
  await finalizeTaskFailure(task.id, task.points_cost || 0, safeReason);
}

async function failStaleVideoTasks(): Promise<void> {
  const queuedMinutes = positiveInt(process.env.TASK_QUEUE_STALE_QUEUED_MINUTES, 30);
  const processingMinutesNoProvider = positiveInt(process.env.VIDEO_TASK_STALE_PROCESSING_MINUTES, 45);
  const tasks = await query<any>(
    `SELECT t.id, t.task_type, t.points_cost, t.status, t.provider_task_id, t.provider_started_at, t.started_at, t.created_at,
            m.config AS model_config
       FROM ai_tasks t
       LEFT JOIN ai_models m ON m.id = t.actual_model_id
      WHERE t.task_type IN ('image', 'video')
        AND (
          (t.status = 'queued' AND COALESCE(t.queued_at, t.created_at) < DATE_SUB(NOW(3), INTERVAL ? MINUTE))
          OR (t.status = 'processing' AND t.provider_task_id IS NULL AND COALESCE(t.started_at, t.updated_at, t.created_at) < DATE_SUB(NOW(3), INTERVAL ? MINUTE))
          OR (t.status = 'processing' AND t.provider_task_id IS NOT NULL
              AND COALESCE(t.provider_started_at, t.started_at, t.created_at) < DATE_SUB(NOW(3), INTERVAL ? MINUTE))
        )
      ORDER BY t.created_at ASC
      LIMIT 50`,
    [queuedMinutes, processingMinutesNoProvider, processingMinutesNoProvider],
  );

  for (const task of tasks) {
    const label = task.task_type === 'video' ? 'Video' : 'Image';
    const modelConfig = parseJson(task.model_config, {});
    // Check per-model max_polling_minutes override for stale detection
    if (task.status === 'processing' && task.provider_task_id && modelConfig.max_polling_minutes) {
      const startedAt = new Date(task.provider_started_at || task.started_at || task.created_at).getTime();
      if (Number.isFinite(startedAt) && Date.now() - startedAt <= modelConfig.max_polling_minutes * 60 * 1000) {
        continue; // Not yet stale — per-model limit not exceeded, skip this task
      }
    }
    const reason = task.status === 'queued'
      ? `${label} task stayed queued too long; points refunded.`
      : task.provider_task_id
        ? 'Provider task polling timed out; points refunded.'
        : `${label} task was not submitted to provider; points refunded.`;
    await finalizeTaskFailure(task.id, task.points_cost || 0, reason).catch(async (err: any) => {
      await addTaskLog(task.id, 'provider_stale_recover_failed', (err.message || 'Stale provider task handling failed').substring(0, 500)).catch(() => undefined);
    });
  }
}

async function loadVideoPollingTask(taskId: number): Promise<any | null> {
  return queryOne<any>(
    `SELECT t.*, i.prompt, i.params,
            m.id AS model_id, m.provider_id, m.name AS model_name, m.query_task_url, m.status_mapping,
            m.config AS model_config,
            p.provider_type, p.api_base_url AS provider_api_base_url, p.api_key AS provider_api_key
       FROM ai_tasks t
       LEFT JOIN ai_task_inputs i ON i.task_id = t.id
       LEFT JOIN ai_models m ON m.id = t.actual_model_id
       LEFT JOIN ai_model_providers p ON p.id = m.provider_id
      WHERE t.id = ? AND t.task_type IN ('image', 'video') AND t.status = 'processing'
      LIMIT 1`,
    [taskId],
  );
}

function normalizeProviderStatus(status: string): ProviderInternalStatus {
  const lower = String(status || '').toLowerCase();
  if (['success', 'succeeded', 'completed', 'done'].includes(lower)) return 'completed';
  if (['failed', 'error', 'timeout', 'cancelled', 'canceled'].includes(lower)) return 'failed';
  return 'processing';
}

function estimateVideoProgress(pollCount: number, providerStatus: string, mapped: ProviderInternalStatus): number {
  if (mapped === 'completed') return 85;
  if (mapped === 'failed') return 80;
  const lower = String(providerStatus || '').toLowerCase();
  if (['pending', 'queued'].includes(lower)) return Math.min(30 + pollCount, 45);
  if (['running', 'processing', 'generating'].includes(lower)) return Math.min(40 + pollCount * 3, 80);
  return Math.min(30 + pollCount * 2, 75);
}

function safeProviderMessage(message: any): string {
  const text = String(message || '').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]');
  return text.replace(/(api[_-]?key|token|secret|password)["'=:\s]+[^,\s}]+/ig, '$1=[filtered]').substring(0, 1000);
}
