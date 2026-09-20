import { Job, Queue, Worker } from 'bullmq';
import { query } from '../utils/db';
import { processComicCompositionJob } from './comic-composition-worker.service';

const queueName = process.env.COMIC_COMPOSITION_QUEUE_NAME || 'comic-composition-jobs';
const redisUrl = String(process.env.REDIS_URL || '').trim();
const memoryQueue: number[] = [];
const queuedIds = new Set<number>();
const runningIds = new Set<number>();
const maxConcurrent = positiveInt(process.env.COMIC_COMPOSITION_CONCURRENCY, 1);
const maxQueueLength = positiveInt(process.env.COMIC_COMPOSITION_QUEUE_MAX_LENGTH, 100);
const maxAttempts = positiveInt(process.env.COMIC_COMPOSITION_QUEUE_ATTEMPTS, 2);
const backoffMs = positiveInt(process.env.COMIC_COMPOSITION_QUEUE_BACKOFF_MS, 3000);

let bullQueue: Queue | null = null;
let bullWorker: Worker | null = null;
let memoryRunnerActive = false;
let activeCount = 0;

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

export function compositionQueueJobId(jobId: number) {
  if (!Number.isInteger(jobId) || jobId <= 0) throw new Error('invalid comic composition job id');
  return `comic-composition-${jobId}`;
}

function ensureBullRuntime(): Queue {
  if (!redisUrl) throw new Error('REDIS_URL 未配置');
  if (!bullQueue) {
    bullQueue = new Queue(queueName, {
      connection: redisConnectionOptions(false),
      defaultJobOptions: {
        attempts: maxAttempts,
        backoff: { type: 'exponential', delay: backoffMs },
        removeOnComplete: { age: 24 * 60 * 60, count: 500 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 2000 },
      },
    });
  }
  if (!bullWorker) {
    bullWorker = new Worker(
      queueName,
      async (job: Job<{ jobId: number }>) => {
        const jobId = Number(job.data?.jobId || 0);
        if (!Number.isInteger(jobId) || jobId <= 0) throw new Error('合成队列任务缺少有效 jobId');
        await processComicCompositionJob(jobId);
      },
      { connection: redisConnectionOptions(true), concurrency: maxConcurrent },
    );
    bullWorker.on('failed', (job, err) => {
      console.error(`[ComicCompositionQueue] Job #${job?.data?.jobId || job?.id || 'unknown'} failed:`, err.message);
    });
    bullWorker.on('error', err => console.error('[ComicCompositionQueue] Worker error:', err.message));
  }
  return bullQueue;
}

export async function enqueueComicCompositionJob(jobId: number): Promise<boolean> {
  compositionQueueJobId(jobId);
  if (redisUrl) {
    try {
      const queue = ensureBullRuntime();
      await queue.add('compose', { jobId }, { jobId: compositionQueueJobId(jobId) });
      return true;
    } catch (err: any) {
      console.error(`[ComicCompositionQueue] enqueue #${jobId} failed:`, err?.message || err);
      return false;
    }
  }
  if (process.env.NODE_ENV === 'production') {
    console.warn('[ComicCompositionQueue] REDIS_URL 未配置，合成任务暂用进程内队列；重启时依赖数据库恢复。');
  }
  if (queuedIds.has(jobId) || runningIds.has(jobId)) return true;
  if (memoryQueue.length >= maxQueueLength) return false;
  queuedIds.add(jobId);
  memoryQueue.push(jobId);
  processMemoryQueue();
  return true;
}

function processMemoryQueue() {
  if (memoryRunnerActive) return;
  memoryRunnerActive = true;
  while (memoryQueue.length && activeCount < maxConcurrent) {
    const jobId = memoryQueue.shift();
    if (!jobId) break;
    queuedIds.delete(jobId);
    runningIds.add(jobId);
    activeCount += 1;
    processComicCompositionJob(jobId)
      .catch(err => console.error(`[ComicCompositionQueue] Job #${jobId} failed:`, err?.message || err))
      .finally(() => {
        activeCount -= 1;
        runningIds.delete(jobId);
        processMemoryQueue();
      });
  }
  memoryRunnerActive = false;
}

export async function recoverComicCompositionJobs(limit = 100): Promise<number> {
  const rows = await query<any>(
    "SELECT id FROM comic_composition_jobs WHERE status IN ('pending','processing') ORDER BY id ASC LIMIT ?",
    [Math.max(1, Math.min(500, Math.floor(limit)))],
  );
  let queued = 0;
  for (const row of rows) {
    const jobId = Number(row.id || 0);
    if (!jobId) continue;
    await query("UPDATE comic_composition_jobs SET status='pending', error_message=NULL WHERE id=?", [jobId]);
    if (await enqueueComicCompositionJob(jobId)) queued += 1;
  }
  return queued;
}

export async function closeComicCompositionQueue(): Promise<void> {
  const worker = bullWorker;
  const queue = bullQueue;
  bullWorker = null;
  bullQueue = null;
  if (worker) await worker.close();
  if (queue) await queue.close();
}

export function getComicCompositionQueueStatus() {
  return {
    mode: redisUrl ? 'bullmq' : 'memory',
    queued: memoryQueue.length,
    active: activeCount,
    concurrency: maxConcurrent,
    maxQueued: maxQueueLength,
  };
}
