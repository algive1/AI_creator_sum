// src/services/task-queue.service.ts

type TaskHandler = (data: any) => Promise<void>;

interface QueueItem {
  taskId: number;
  data: any;
  handler: TaskHandler;
}

const queue: QueueItem[] = [];
let isRunning = false;
const MAX_CONCURRENT = 3;
let activeCount = 0;
const queuedTaskIds = new Set<number>();
const runningTaskIds = new Set<number>();

export function enqueue(taskId: number, data: any, handler: TaskHandler): void {
  if (process.env.CHECK_DISABLE_QUEUE === 'true' && process.env.NODE_ENV === 'development') {
    console.log(`[Queue] 任务 #${taskId} 已创建，自检模式跳过异步执行`);
    return;
  }
  if (queuedTaskIds.has(taskId) || runningTaskIds.has(taskId)) {
    console.log(`[Queue] 任务 #${taskId} 已入队或正在执行，跳过重复队列`);
    return;
  }
  queuedTaskIds.add(taskId);
  queue.push({ taskId, data, handler });
  console.log(`[Queue] 任务 #${taskId} 已入队，队列长度: ${queue.length}`);
  processQueue();
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
    console.log(`[Queue] 开始处理任务 #${item.taskId}，活跃任务: ${activeCount}`);

    // 异步执行，不阻塞队列。
    item.handler(item.data)
      .catch(err => console.error(`[Queue] 任务 #${item.taskId} 异常:`, err.message))
      .finally(() => {
        activeCount--;
        runningTaskIds.delete(item.taskId);
        console.log(`[Queue] 任务 #${item.taskId} 完成，活跃任务: ${activeCount}`);
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
  return { queued: queue.length, active: activeCount };
}
