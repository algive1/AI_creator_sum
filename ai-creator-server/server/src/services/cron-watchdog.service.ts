/**
 * 定时任务看门狗 + 心跳注册。
 * 每个定时任务执行后更新心跳时间戳；看门狗每 5 分钟扫描一次，
 * 若某任务超过预期间隔的 3 倍仍未更新心跳，则打 error log。
 *
 * 同时暴露 runCronTask() 供 HTTP 手动触发（admin-system.ts 的 /cron/:taskName 端点调用）。
 */

export type CronTaskName = 'membership-expiry' | 'monthly-points' | 'daily-backup' | 'ad-cleanup';

interface CronEntry {
  name: CronTaskName;
  intervalMs: number;
  lastRun: number;
  handler: () => Promise<any>;
  /** 上次运行是否失败 */
  lastError: string;
}

const registry = new Map<CronTaskName, CronEntry>();

function heartbeat(name: CronTaskName): void {
  const entry = registry.get(name);
  if (entry) entry.lastRun = Date.now();
}

function markError(name: CronTaskName, err: string): void {
  const entry = registry.get(name);
  if (entry) entry.lastError = err;
}

/** 注册一个定时任务到看门狗 */
export function registerCronHeartbeat(
  name: CronTaskName,
  intervalMs: number,
  handler: () => Promise<any>,
): void {
  registry.set(name, {
    name,
    intervalMs,
    lastRun: Date.now(),
    handler,
    lastError: '',
  });
}

/** 看门狗：每 5 分钟检查所有任务心跳 */
export function startCronWatchdog(): void {
  setInterval(() => {
    const now = Date.now();
    for (const entry of registry.values()) {
      const elapsed = now - entry.lastRun;
      const maxGap = entry.intervalMs * 3;
      if (elapsed > maxGap) {
        console.error(
          `[CronWatchdog] ${entry.name} 超过 ${Math.round(elapsed / 1000)}s 未执行 ` +
          `(预期间隔 ${Math.round(entry.intervalMs / 1000)}s, 上限 ${Math.round(maxGap / 1000)}s)` +
          (entry.lastError ? `, 上次错误: ${entry.lastError}` : ''),
        );
      }
    }
  }, 5 * 60 * 1000);
}

/** 包装 handler：自动更新心跳 + 错误记录 */
export function wrapCronTask(name: CronTaskName, handler: () => Promise<any>): () => Promise<any> {
  return async () => {
    try {
      const result = await handler();
      heartbeat(name);
      markError(name, '');
      return result;
    } catch (err: any) {
      markError(name, err?.message || String(err));
      throw err;
    }
  };
}

/** HTTP 手动触发（供 admin-system 路由调用） */
export async function runCronTask(name: CronTaskName): Promise<{ success: boolean; message: string; data?: any }> {
  const entry = registry.get(name);
  if (!entry) {
    return { success: false, message: `未知的定时任务: ${name}` };
  }
  try {
    const data = await entry.handler();
    heartbeat(name);
    markError(name, '');
    return { success: true, message: `${name} 执行成功`, data };
  } catch (err: any) {
    markError(name, err?.message || String(err));
    return { success: false, message: `${name} 执行失败: ${err?.message || err}` };
  }
}
