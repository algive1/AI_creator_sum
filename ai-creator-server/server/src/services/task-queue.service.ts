// src/services/task-queue.service.ts

type TaskHandler = (data: any) => Promise<void>;

interface QueueItem {
  taskId: number;
  data: any;
  handler: TaskHandler;
}

const queue: QueueItem[] = [];
let isRunning = false;
const MAX_CONCURRENT = positiveInt(process.env.TASK_CONCURRENCY, 3);
const MAX_QUEUE_LENGTH = positiveInt(process.env.TASK_QUEUE_MAX_LENGTH, 500);
let activeCount = 0;
const queuedTaskIds = new Set<number>();
const runningTaskIds = new Set<number>();

function positiveInt(value: any, fallback: number): number {
  const parsed = parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function enqueue(taskId: number, data: any, handler: TaskHandler): boolean {
  if (process.env.CHECK_DISABLE_QUEUE === 'true' && process.env.NODE_ENV === 'development') {
    console.log(`[Queue] 任务 #${taskId} 已创建，自检模式跳过异步执行`);
    return true;
  }
  if (queuedTaskIds.has(taskId) || runningTaskIds.has(taskId)) {
    console.log(`[Queue] 任务 #${taskId} 已入队或正在执行，跳过重复队列`);
    return true;
  }
  if (queue.length >= MAX_QUEUE_LENGTH) {
    console.warn(`[Queue] 队列已满，拒绝任务 #${taskId} 入队，队列长度: ${queue.length}`);
    return false;
  }
  queuedTaskIds.add(taskId);
  queue.push({ taskId, data, handler });
  logQueueStatus(`[Queue] 任务 #${taskId} 已入队`);
  processQueue();
  return true;
}

async function processQueue(): Promise<void> {
  if (isRunning) return;
  isRunning = true;

  while (queue.length > 0 && activeCount < MAX_CONCURRENT) {
    const item = queue.shift();
    if (!item) break;
    queuedTaskIds.delete(item.taskId);
    runningTaskIds.add(item.taskId);

    activeCount++;
    logQueueStatus(`[Queue] 开始处理任务 #${item.taskId}`);

    // 异步执行，不阻塞队列。
    item.handler(item.data)
      .catch(err => console.error(`[Queue] 任务 #${item.taskId} 异常:`, err.message))
      .finally(() => {
        activeCount--;
        runningTaskIds.delete(item.taskId);
        logQueueStatus(`[Queue] 任务 #${item.taskId} 完成`);
        processQueue();
      });
  }

  isRunning = false;
}

/**
 * 包装任务处理器，AI 任务完成后自动转存输出文件到存储服务。
 * @param taskId 任务 ID
 * @param userId 用户 ID
 * @param handler 实际 AI 任务处理器
 * @param outputs AI 返回的输出列表 { url, outputName, outputIndex, outputType }
 */
export function wrapWithTransfer(
  taskId: number,
  userId: number,
  handler: TaskHandler,
  outputs?: Array<{ url: string; outputName: string; outputIndex: number; outputType: 'image' | 'video' }>,
): TaskHandler {
  if (!outputs || outputs.length === 0) return handler;

  return async (data: any) => {
    // 1. 先执行原始 AI 任务。
    await handler(data);

    // 2. 转存输出文件到存储服务。
    try {
      const { batchTransferFromUrl } = require('./storage/transfer.service');
      console.log(`[Queue] 任务 #${taskId} 开始转存 ${outputs.length} 个输出文件`);
      const results = await batchTransferFromUrl(
        outputs.map(o => ({
          taskId,
          userId,
          sourceUrl: o.url,
          outputName: o.outputName,
          outputIndex: o.outputIndex,
          outputType: o.outputType,
        })),
      );
      console.log(`[Queue] 任务 #${taskId} 转存完成: ${results.length}/${outputs.length}`);
    } catch (err: any) {
      console.error(`[Queue] 任务 #${taskId} 转存异常:`, err.message);
      // 转存失败不影响原任务结果。
    }
  };
}

export function getQueueStatus() {
  return { queued: queue.length, active: activeCount, concurrency: MAX_CONCURRENT, maxQueued: MAX_QUEUE_LENGTH };
}

function logQueueStatus(prefix: string): void {
  console.log(`${prefix}，等待队列: ${queue.length}，活跃任务: ${activeCount}/${MAX_CONCURRENT}`);
}
