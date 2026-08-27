import { getConnection, query, queryOne } from '../utils/db';
import { parseJson } from '../utils/content-helpers';
import { AdapterRegistry } from './adapters/adapter.registry';
import { QueryTaskResult } from './adapters/adapter.interface';
import { planImageOutputSettlement } from './image-output-settlement.service';
import { decryptApiKey } from './openai-adapter.service';
import {
  FREE_IMAGE_QUOTA_BILLING_SOURCE,
  consumeRecoveredFreeImageQuotaForTaskTx,
  isFreeImageQuotaSnapshot,
} from './free-image-quota.service';
import {
  addTaskLog,
  cleanupSavedTaskOutputs,
  positiveInt,
  SavedTaskOutput,
  saveTaskOutputWithRetry,
} from './task.service';

type ProviderInternalStatus = 'processing' | 'completed' | 'failed';

export const TIMEOUT_RECOVERY_POINT_SOURCE = 'task_recovery';
export const TIMEOUT_RECOVERY_POINT_REF_TYPE = 'ai_task_timeout_recovery_charge';

export interface RecoveredTimeoutSettlementInput {
  currentBalance: number;
  frozenBalance: number;
  requestedPointsCost: number;
  actualPointsCost: number;
  previousPointsRefunded: number;
  correctionAlreadyApplied: boolean;
}

export interface RecoveredTimeoutSettlementPlan {
  balanceAfter: number;
  debitAmount: number;
  creditAmount: number;
  netRefundPoints: number;
  totalSpentDelta: number;
  totalRefundedDelta: number;
  shouldWriteCorrectionLog: boolean;
}

export interface RecoverTimedOutProviderTasksOptions {
  apply?: boolean;
  limit?: number;
}

export interface RecoverTimedOutProviderTasksResult {
  mode: 'dry-run' | 'apply';
  scanned: number;
  recovered: number;
  skipped: number;
  failed: number;
  items: Array<{
    taskId: number;
    taskNo?: string;
    taskType?: string;
    action: string;
    reason?: string;
    providerStatus?: string;
    outputCount?: number;
    actualPointsCost?: number;
    netRefundPoints?: number;
  }>;
}

export function planRecoveredTimeoutTaskSettlement(input: RecoveredTimeoutSettlementInput): RecoveredTimeoutSettlementPlan {
  const currentBalance = Math.trunc(Number(input.currentBalance || 0));
  const requestedPointsCost = Math.max(0, Math.trunc(Number(input.requestedPointsCost || 0)));
  const actualPointsCost = Math.min(requestedPointsCost, Math.max(0, Math.trunc(Number(input.actualPointsCost || 0))));
  const previousPointsRefunded = Math.max(0, Math.trunc(Number(input.previousPointsRefunded || 0)));
  const netRefundPoints = Math.max(0, requestedPointsCost - actualPointsCost);

  if (input.correctionAlreadyApplied) {
    return {
      balanceAfter: currentBalance,
      debitAmount: 0,
      creditAmount: 0,
      netRefundPoints,
      totalSpentDelta: 0,
      totalRefundedDelta: 0,
      shouldWriteCorrectionLog: false,
    };
  }

  const debitAmount = Math.max(0, previousPointsRefunded - netRefundPoints);
  const creditAmount = Math.max(0, netRefundPoints - previousPointsRefunded);
  return {
    balanceAfter: currentBalance - debitAmount + creditAmount,
    debitAmount,
    creditAmount,
    netRefundPoints,
    totalSpentDelta: actualPointsCost,
    totalRefundedDelta: netRefundPoints - previousPointsRefunded,
    shouldWriteCorrectionLog: debitAmount > 0 || creditAmount > 0 || actualPointsCost > 0,
  };
}

export async function recoverTimedOutProviderTasks(options: RecoverTimedOutProviderTasksOptions = {}): Promise<RecoverTimedOutProviderTasksResult> {
  const apply = options.apply === true;
  const limit = Math.min(Math.max(1, positiveInt(options.limit, 50)), 500);
  const tasks = await loadTimeoutFailedTasks(limit);
  const result: RecoverTimedOutProviderTasksResult = {
    mode: apply ? 'apply' : 'dry-run',
    scanned: tasks.length,
    recovered: 0,
    skipped: 0,
    failed: 0,
    items: [],
  };

  for (const task of tasks) {
    try {
      const providerCheck = await queryProviderStatus(task);
      const providerStatus = providerCheck.mapped;
      if (providerStatus !== 'completed') {
        result.skipped++;
        result.items.push({
          taskId: task.id,
          taskNo: task.task_no,
          taskType: task.task_type,
          action: 'skipped',
          reason: providerStatus === 'failed' ? 'provider_failed' : 'provider_still_processing',
          providerStatus: providerCheck.rawStatus,
        });
        continue;
      }

      const settlement = buildRecoveredOutputSettlement(task, providerCheck.providerResult);
      if (settlement.shouldFail) {
        result.skipped++;
        result.items.push({
          taskId: task.id,
          taskNo: task.task_no,
          taskType: task.task_type,
          action: 'skipped',
          reason: 'provider_completed_without_outputs',
          providerStatus: providerCheck.rawStatus,
        });
        continue;
      }

      const existingCorrection = await hasTimeoutRecoveryCorrectionLog(task.id);
      const account = await queryOne<any>('SELECT balance, frozen_balance FROM point_accounts WHERE user_id = ? LIMIT 1', [task.user_id]);
      const plan = planRecoveredTimeoutTaskSettlement({
        currentBalance: Number(account?.balance || 0),
        frozenBalance: Number(account?.frozen_balance || 0),
        requestedPointsCost: Number(task.points_cost || 0),
        actualPointsCost: settlement.pointsCost,
        previousPointsRefunded: Number(task.points_refunded || 0),
        correctionAlreadyApplied: existingCorrection,
      });

      if (!apply) {
        result.recovered++;
        result.items.push({
          taskId: task.id,
          taskNo: task.task_no,
          taskType: task.task_type,
          action: 'would_recover',
          providerStatus: providerCheck.rawStatus,
          outputCount: settlement.outputUrls.length,
          actualPointsCost: settlement.pointsCost,
          netRefundPoints: plan.netRefundPoints,
        });
        continue;
      }

      const savedOutputs = await saveMissingRecoveredOutputs(task, providerCheck.providerResult, settlement.outputUrls);
      try {
        const applied = await finalizeRecoveredTimeoutTask(task, {
          actualPointsCost: settlement.pointsCost,
          requestedPointsCost: Number(task.points_cost || 0),
          netRefundPoints: plan.netRefundPoints,
          costSnapshot: {
            ...(providerCheck.providerResult.cost || {}),
            recoveredFromTimeout: true,
            expectedImageCount: settlement.expectedImageCount,
            actualImageCount: settlement.actualImageCount,
            partialOutputs: settlement.partial,
          },
          providerStatus: providerCheck.rawStatus,
          providerMessage: providerCheck.message,
          outputCount: settlement.outputUrls.length,
        });
        result.recovered++;
        result.items.push({
          taskId: task.id,
          taskNo: task.task_no,
          taskType: task.task_type,
          action: applied ? 'recovered' : 'already_recovered',
          providerStatus: providerCheck.rawStatus,
          outputCount: settlement.outputUrls.length,
          actualPointsCost: settlement.pointsCost,
          netRefundPoints: plan.netRefundPoints,
        });
      } catch (err) {
        if (savedOutputs.length > 0) await cleanupSavedTaskOutputs(task.id, savedOutputs).catch(() => undefined);
        throw err;
      }
    } catch (err: any) {
      result.failed++;
      result.items.push({
        taskId: task.id,
        taskNo: task.task_no,
        taskType: task.task_type,
        action: 'error',
        reason: safeProviderMessage(err.message || 'timeout recovery failed'),
      });
      await addTaskLog(task.id, 'timeout_recovery_error', safeProviderMessage(err.message || 'timeout recovery failed')).catch(() => undefined);
    }
  }

  return result;
}

async function loadTimeoutFailedTasks(limit: number): Promise<any[]> {
  return query<any>(
    `SELECT t.*, i.prompt, i.params,
            m.id AS model_id, m.provider_id, m.query_task_url, m.status_mapping, m.config AS model_config,
            p.provider_type, p.api_base_url AS provider_api_base_url, p.api_key AS provider_api_key
       FROM ai_tasks t
       LEFT JOIN ai_task_inputs i ON i.task_id = t.id
       LEFT JOIN ai_models m ON m.id = COALESCE(t.actual_model_id, t.model_id)
       LEFT JOIN ai_model_providers p ON p.id = m.provider_id
      WHERE t.task_type IN ('image', 'video')
        AND t.status = 'failed'
        AND t.provider_task_id IS NOT NULL
        AND (
          LOWER(COALESCE(t.fail_reason, '')) LIKE '%timeout%'
          OR LOWER(COALESCE(t.fail_reason, '')) LIKE '%timed out%'
          OR LOWER(COALESCE(t.fail_reason, '')) LIKE '%polling count exceeded%'
          OR COALESCE(t.fail_reason, '') LIKE '%超时%'
          OR LOWER(COALESCE(t.provider_status_message, '')) LIKE '%timeout%'
          OR LOWER(COALESCE(t.provider_status_message, '')) LIKE '%timed out%'
          OR LOWER(COALESCE(t.provider_status_message, '')) LIKE '%polling count exceeded%'
          OR COALESCE(t.provider_status_message, '') LIKE '%超时%'
        )
      ORDER BY COALESCE(t.failed_at, t.updated_at, t.created_at) DESC
      LIMIT ${limit}`,
  );
}

async function queryProviderStatus(task: any): Promise<{
  providerResult: QueryTaskResult;
  mapped: ProviderInternalStatus;
  rawStatus: string;
  message: string;
}> {
  const adapter = AdapterRegistry.get(task.provider_type || 'openai');
  if (!adapter) throw new Error('Unsupported provider: ' + (task.provider_type || 'unknown'));
  const providerResult = await adapter.queryTask(String(task.provider_task_id || ''), {
    baseUrl: task.provider_api_base_url || '',
    apiKey: decryptApiKey(task.provider_api_key || ''),
    timeout: 30000,
    authType: 'bearer',
    queryTaskUrl: task.query_task_url || undefined,
  });
  const mapped = normalizeProviderStatus(adapter.mapStatus(providerResult.status, parseJson(task.status_mapping, {})));
  const rawStatus = String(providerResult.status || mapped).substring(0, 64);
  return {
    providerResult,
    mapped,
    rawStatus,
    message: safeProviderMessage(providerResult.error?.message || providerResult.status || mapped),
  };
}

function buildRecoveredOutputSettlement(task: any, providerResult: QueryTaskResult) {
  const urls = providerResult.result?.urls || [];
  const outputType = task.task_type === 'video' ? 'video' : 'image';
  if (outputType === 'image') {
    const params = parseJson(task.params, {});
    const priceSnapshot = parseJson(task.price_snapshot, {});
    return planImageOutputSettlement({
      urls,
      expectedImageCount: positiveInt(params.imageCount || priceSnapshot.imageCount, 1),
      frozenPointsCost: Number(task.points_cost || 0),
      unitPointsCost: priceSnapshot.unitPointsCost,
    });
  }
  return {
    outputUrls: urls,
    expectedImageCount: urls.length,
    actualImageCount: urls.length,
    pointsCost: urls.length > 0 ? Number(task.points_cost || 0) : 0,
    refundPointsCost: urls.length > 0 ? 0 : Number(task.points_cost || 0),
    partial: false,
    shouldFail: urls.length === 0,
  };
}

async function saveMissingRecoveredOutputs(task: any, providerResult: QueryTaskResult, outputUrls: string[]): Promise<SavedTaskOutput[]> {
  const existing = await query<any>('SELECT output_index FROM ai_task_outputs WHERE task_id = ?', [task.id]);
  const existingIndexes = new Set(existing.map(item => Number(item.output_index)));
  const params = parseJson(task.params, {});
  const outputType = task.task_type === 'video' ? 'video' : 'image';
  const savedOutputs: SavedTaskOutput[] = [];

  for (let i = 0; i < outputUrls.length; i++) {
    if (existingIndexes.has(i)) continue;
    const savedOutput = await saveTaskOutputWithRetry({
      taskId: task.id,
      userId: task.user_id,
      url: outputUrls[i],
      index: i,
      outputType,
      prompt: task.prompt || '',
      params,
      sizePlan: params.sizePlan,
      metadata: {
        ...(providerResult.result?.metadata || {}),
        recoveredFromTimeout: true,
      },
    });
    savedOutputs.push(savedOutput);
  }

  return savedOutputs;
}

async function finalizeRecoveredTimeoutTask(task: any, input: {
  actualPointsCost: number;
  requestedPointsCost: number;
  netRefundPoints: number;
  costSnapshot: Record<string, any>;
  providerStatus: string;
  providerMessage: string;
  outputCount: number;
}): Promise<boolean> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [taskRows] = await conn.execute(
      'SELECT user_id, status, points_cost, points_refunded, actual_model_id, model_id, price_snapshot FROM ai_tasks WHERE id = ? FOR UPDATE',
      [task.id],
    ) as any;
    const lockedTask = taskRows?.[0];
    if (!lockedTask?.user_id) {
      await conn.rollback();
      return false;
    }
    if (lockedTask.status === 'completed') {
      await conn.rollback();
      return false;
    }
    if (lockedTask.status !== 'failed') {
      await conn.rollback();
      return false;
    }

    if (isFreeImageQuotaSnapshot(lockedTask.price_snapshot || task.price_snapshot)) {
      const actualImageCount = Math.max(0, positiveInt(input.costSnapshot?.actualImageCount ?? input.outputCount, input.outputCount));
      await consumeRecoveredFreeImageQuotaForTaskTx(conn, task.id, actualImageCount, 'Provider completed after local timeout');
      await conn.execute(
        `UPDATE ai_tasks
            SET status = 'completed', progress = 100, actual_model_id = ?, actual_points_cost = 0,
                cost_snapshot = ?, points_refunded = 0, fail_reason = '',
                provider_status = 'completed', provider_status_message = ?,
                next_poll_at = NULL, processing_lock_until = NULL,
                failed_at = NULL, completed_at = COALESCE(completed_at, NOW(3)), updated_at = NOW(3)
          WHERE id = ?`,
        [
          lockedTask.actual_model_id || lockedTask.model_id || 0,
          JSON.stringify({
            ...(input.costSnapshot || {}),
            billingSource: FREE_IMAGE_QUOTA_BILLING_SOURCE,
            requestedPointsCost: Number(lockedTask.points_cost || input.requestedPointsCost || 0),
            refundedPointsCost: 0,
            timeoutRecovery: true,
          }),
          input.providerMessage || input.providerStatus || 'Provider timeout recovery completed.',
          task.id,
        ],
      );
      await conn.execute(
        `INSERT INTO user_assets
         (user_id, total_creations, created_at, updated_at)
         VALUES (?, 1, NOW(3), NOW(3))
         ON DUPLICATE KEY UPDATE
           total_creations = total_creations + 1,
           updated_at = NOW(3)`,
        [lockedTask.user_id],
      );
      await conn.execute(
        'INSERT INTO ai_task_logs (task_id, event, message, created_at) VALUES (?, ?, ?, NOW(3))',
        [task.id, 'free_quota_consumed', 'Free quota consumed by timeout recovery.'],
      );
      await conn.execute(
        'INSERT INTO ai_task_logs (task_id, event, message, created_at) VALUES (?, ?, ?, NOW(3))',
        [task.id, 'timeout_recovered', 'Provider completed after local timeout; task recovered and settled.'],
      );
      await conn.execute(
        'INSERT INTO ai_task_logs (task_id, event, message, created_at) VALUES (?, ?, ?, NOW(3))',
        [task.id, 'completed', 'Task completed by timeout recovery.'],
      );
      await conn.commit();
      return true;
    }

    const [accountRows] = await conn.execute(
      'SELECT balance, frozen_balance, total_spent, total_refunded, version FROM point_accounts WHERE user_id = ? FOR UPDATE',
      [lockedTask.user_id],
    ) as any;
    const account = accountRows?.[0];
    if (!account) {
      await conn.rollback();
      return false;
    }

    const [logRows] = await conn.execute(
      'SELECT id FROM point_logs WHERE source = ? AND ref_type = ? AND ref_id = ? LIMIT 1',
      [TIMEOUT_RECOVERY_POINT_SOURCE, TIMEOUT_RECOVERY_POINT_REF_TYPE, String(task.id)],
    ) as any;
    const plan = planRecoveredTimeoutTaskSettlement({
      currentBalance: Number(account.balance || 0),
      frozenBalance: Number(account.frozen_balance || 0),
      requestedPointsCost: Number(lockedTask.points_cost || input.requestedPointsCost || 0),
      actualPointsCost: input.actualPointsCost,
      previousPointsRefunded: Number(lockedTask.points_refunded || 0),
      correctionAlreadyApplied: Boolean(logRows?.length),
    });
    const frozenBefore = Number(account.frozen_balance || 0);
    const frozenAfter = frozenBefore;

    if (plan.shouldWriteCorrectionLog) {
      const refundedDelta = Math.trunc(plan.totalRefundedDelta);
      await conn.execute(
        `UPDATE point_accounts
            SET balance = ?, total_spent = GREATEST(total_spent + ?, 0),
                total_refunded = GREATEST(total_refunded + ?, 0),
                version = version + 1, updated_at = NOW(3)
          WHERE user_id = ? AND version = ?`,
        [plan.balanceAfter, plan.totalSpentDelta, refundedDelta, lockedTask.user_id, account.version],
      );
      const logAmount = plan.creditAmount - plan.debitAmount;
      await conn.execute(
        `INSERT IGNORE INTO point_logs
         (user_id, type, amount, balance_before, balance_after, frozen_before, frozen_after,
          source, ref_type, ref_id, title, remark, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
        [
          lockedTask.user_id,
          logAmount > 0 ? 'refund' : 'spend',
          logAmount,
          account.balance,
          plan.balanceAfter,
          frozenBefore,
          frozenAfter,
          TIMEOUT_RECOVERY_POINT_SOURCE,
          TIMEOUT_RECOVERY_POINT_REF_TYPE,
          String(task.id),
          '超时误判纠正扣费',
          `Provider completed after local timeout; outputs=${input.outputCount}; actualCost=${input.actualPointsCost}; netRefund=${plan.netRefundPoints}`,
        ],
      );
    }

    await conn.execute(
      `UPDATE ai_tasks
          SET status = 'completed', progress = 100, actual_model_id = ?, actual_points_cost = ?,
              cost_snapshot = ?, points_refunded = ?, fail_reason = '',
              provider_status = 'completed', provider_status_message = ?,
              next_poll_at = NULL, processing_lock_until = NULL,
              failed_at = NULL, completed_at = COALESCE(completed_at, NOW(3)), updated_at = NOW(3)
        WHERE id = ?`,
      [
        lockedTask.actual_model_id || lockedTask.model_id || 0,
        input.actualPointsCost,
        JSON.stringify({
          ...(input.costSnapshot || {}),
          requestedPointsCost: Number(lockedTask.points_cost || input.requestedPointsCost || 0),
          refundedPointsCost: plan.netRefundPoints,
          timeoutRecovery: true,
        }),
        plan.netRefundPoints,
        input.providerMessage || input.providerStatus || 'Provider timeout recovery completed.',
        task.id,
      ],
    );
    await conn.execute(
      `INSERT INTO user_assets
       (user_id, points_balance, total_creations, created_at, updated_at)
       VALUES (?, ?, 1, NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE
         points_balance = VALUES(points_balance),
         total_creations = total_creations + 1,
         updated_at = NOW(3)`,
      [lockedTask.user_id, plan.balanceAfter],
    );
    await conn.execute(
      'INSERT INTO ai_task_logs (task_id, event, message, created_at) VALUES (?, ?, ?, NOW(3))',
      [task.id, 'timeout_recovered', 'Provider completed after local timeout; task recovered and settled.'],
    );
    await conn.execute(
      'INSERT INTO ai_task_logs (task_id, event, message, created_at) VALUES (?, ?, ?, NOW(3))',
      [task.id, 'completed', 'Task completed by timeout recovery.'],
    );
    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function hasTimeoutRecoveryCorrectionLog(taskId: number): Promise<boolean> {
  const row = await queryOne<any>(
    'SELECT id FROM point_logs WHERE source = ? AND ref_type = ? AND ref_id = ? LIMIT 1',
    [TIMEOUT_RECOVERY_POINT_SOURCE, TIMEOUT_RECOVERY_POINT_REF_TYPE, String(taskId)],
  );
  return Boolean(row?.id);
}

function normalizeProviderStatus(status: string): ProviderInternalStatus {
  const lower = String(status || '').toLowerCase();
  if (['success', 'succeeded', 'completed', 'done'].includes(lower)) return 'completed';
  if (['failed', 'error', 'timeout', 'cancelled', 'canceled'].includes(lower)) return 'failed';
  return 'processing';
}

function safeProviderMessage(message: any): string {
  const text = String(message || '').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]');
  return text.replace(/(api[_-]?key|token|secret|password)["'=:\s]+[^,\s}]+/ig, '$1=[filtered]').substring(0, 1000);
}
