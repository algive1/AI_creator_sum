import { Job, Queue, Worker } from 'bullmq';

type TaskHandler = (data: any) => Promise<void>;
type DurableTaskProcessor = (taskId: number) => Promise<void>;

interface QueueItem {
  taskId: number;
  data: any;
  handler: TaskHandler;
}

const queueName = process.env.TASK_QUEUE_NAME || 'ai-creation-tasks';
const redisUrl = String(process.env.REDIS_URL || '').trim();
const memoryQueue: QueueItem[] = [];
const queuedTaskIds = new Set<number>();
const runningTaskIds = new Set<number>();
const MAX_CONCURRENT = positiveInt(process.env.TASK_CONCURRENCY, 3);
const MAX_QUEUE_LENGTH = positiveInt(process.env.TASK_QUEUE_MAX_LENGTH, 500);
const MAX_ATTEMPTS = positiveInt(process.env.TASK_QUEUE_ATTEMPTS, 3);
const BACKOFF_MS = positiveInt(process.env.TASK_QUEUE_BACKOFF_MS, 1500);

let memoryRunnerActive = false;
let activeCount = 0;
let durableProcessor: DurableTaskProcessor | null = null;
let bullQueue: Queue | null = null;
let bullWorker: Worker | null = null;

function positiveInt(value: any, fallback: number): number {
  const parsed = parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function jobIdForTask(taskId: number): string {
  return `task-${taskId}`;
}

function redisConnectionOptions(worker: boolean) {
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: parsed.pathname && parsed.pathname !== '/' ? Number(parsed.pathname.slice(1)) || 0 : 0,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: worker ? null : 1,
    enableOfflineQueue: worker,
  };
}

export function registerDurableTaskProcessor(processor: DurableTaskProcessor): void {
  durableProcessor = processor;
}

function ensureBullRuntime(): Queue {
  if (!redisUrl) throw new Error('REDIS_URL 未配置');
  if (!durableProcessor) throw new Error('持久任务处理器尚未注册');
  if (!bullQueue) {
    bullQueue = new Queue(queueName, {
      connection: redisConnectionOptions(false),
      defaultJobOptions: {
        attempts: MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: BACKOFF_MS },
        removeOnComplete: { age: 24 * 60 * 60, count: 2000 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 5000 },
      },
    });
  }
  if (!bullWorker) {
    bullWorker = new Worker(
      queueName,
      async (job: Job<{ taskId: number }>) => {
        const taskId = Number(job.data?.taskId || 0);
        if (!Number.isInteger(taskId) || taskId <= 0) throw new Error('队列任务缺少有效 taskId');
        await durableProcessor!(taskId);
      },
      { connection: redisConnectionOptions(true), concurrency: MAX_CONCURRENT },
    );
    bullWorker.on('failed', (job, err) => {
      console.error(`[Queue] BullMQ 任务 #${job?.data?.taskId || job?.id || 'unknown'} 失败:`, err.message);
    });
    bullWorker.on('error', err => console.error('[Queue] BullMQ Worker 连接异常:', err.message));
  }
  return bullQueue;
}

export async function enqueue(taskId: number, data: any, handler: TaskHandler): Promise<boolean> {
  if (process.env.CHECK_DISABLE_QUEUE === 'true' && process.env.NODE_ENV === 'development') {
    console.log(`[Queue] 任务 #${taskId} 已创建，自检模式跳过异步执行`);
    return true;
  }
  if (redisUrl) {
    try {
      const queue = ensureBullRuntime();
      await queue.add('ai-task', { taskId }, { jobId: jobIdForTask(taskId) });
      console.log(`[Queue] BullMQ 任务 #${taskId} 已入队`);
      return true;
    } catch (err: any) {
      console.error(`[Queue] BullMQ 任务 #${taskId} 入队失败:`, err?.message || err);
      return false;
    }
  }

  if (process.env.NODE_ENV === 'production') {
    console.warn('[Queue] REDIS_URL 未配置，暂用进程内队列；生产环境应尽快接入 Redis。');
  }
  if (queuedTaskIds.has(taskId) || runningTaskIds.has(taskId)) return true;
  if (memoryQueue.length >= MAX_QUEUE_LENGTH) return false;
  queuedTaskIds.add(taskId);
  memoryQueue.push({ taskId, data, handler });
  processMemoryQueue();
  return true;
}

function processMemoryQueue(): void {
  if (memoryRunnerActive) return;
  memoryRunnerActive = true;
  while (memoryQueue.length > 0 && activeCount < MAX_CONCURRENT) {
    const item = memoryQueue.shift();
    if (!item) break;
    queuedTaskIds.delete(item.taskId);
    runningTaskIds.add(item.taskId);
    activeCount++;
    item.handler(item.data)
      .catch(err => console.error(`[Queue] 任务 #${item.taskId} 异常:`, err.message))
      .finally(() => {
        activeCount--;
        runningTaskIds.delete(item.taskId);
        processMemoryQueue();
      });
  }
  memoryRunnerActive = false;
}

export async function removeQueuedTask(taskId: number): Promise<boolean> {
  if (redisUrl) {
    try {
      const queue = ensureBullRuntime();
      const job = await queue.getJob(jobIdForTask(taskId)) || await queue.getJob(String(taskId));
      if (!job) return true;
      const state = await job.getState();
      if (state === 'active') return false;
      await job.remove();
      return true;
    } catch (err: any) {
      console.error(`[Queue] 移除任务 #${taskId} 失败:`, err?.message || err);
      return false;
    }
  }
  const index = memoryQueue.findIndex(item => item.taskId === taskId);
  if (index >= 0) memoryQueue.splice(index, 1);
  queuedTaskIds.delete(taskId);
  return !runningTaskIds.has(taskId);
}

export async function closeTaskQueue(): Promise<void> {
  const worker = bullWorker;
  const queue = bullQueue;
  bullWorker = null;
  bullQueue = null;
  if (worker) await worker.close();
  if (queue) await queue.close();
}

export function getQueueStatus() {
  return {
    mode: redisUrl ? 'bullmq' : 'memory',
    queued: memoryQueue.length,
    active: activeCount,
    concurrency: MAX_CONCURRENT,
    maxQueued: MAX_QUEUE_LENGTH,
  };
}

export function wrapWithTransfer(
  taskId: number,
  userId: number,
  handler: TaskHandler,
  outputs?: Array<{ url: string; outputName: string; outputIndex: number; outputType: 'image' | 'video' }>,
): TaskHandler {
  if (!outputs?.length) return handler;
  return async (data: any) => {
    await handler(data);
    const { batchTransferFromUrl } = require('./storage/transfer.service');
    await batchTransferFromUrl(outputs.map(output => ({ taskId, userId, sourceUrl: output.url, ...output })));
  };
}
