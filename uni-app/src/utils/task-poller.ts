import { getTasksByIds } from '@/api/task';
import { isTaskEnded } from '@/utils/task-display';

type TaskListener = (task: Record<string, unknown>) => void;
type TaskPollingSubscription = () => void;

class TaskPoller {
  private readonly taskIds = new Set<number>();
  private readonly listeners = new Map<number, Set<TaskListener>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling = false;

  add(taskId: number, listener: TaskListener): TaskPollingSubscription {
    if (!Number.isInteger(taskId) || taskId <= 0) return () => undefined;
    this.taskIds.add(taskId);
    const bucket = this.listeners.get(taskId) || new Set<TaskListener>();
    bucket.add(listener);
    this.listeners.set(taskId, bucket);
    this.ensureTimer();
    return () => this.removeListener(taskId, listener);
  }

  removeListener(taskId: number, listener: TaskListener) {
    const bucket = this.listeners.get(taskId);
    if (!bucket) return;
    bucket.delete(listener);
    if (bucket.size) return;
    this.listeners.delete(taskId);
    this.taskIds.delete(taskId);
    if (!this.taskIds.size) this.stopTimer();
  }

  remove(taskId: number) {
    this.taskIds.delete(taskId);
    this.listeners.delete(taskId);
    if (!this.taskIds.size) this.stopTimer();
  }

  pollNow() {
    return this.poll();
  }

  private ensureTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.poll().catch(() => undefined);
    }, 5000);
  }

  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async poll() {
    if (this.polling || !this.taskIds.size) return;
    this.polling = true;
    try {
      const ids = Array.from(this.taskIds).slice(0, 50);
      const result = await getTasksByIds<{ list?: Record<string, unknown>[] }>(ids);
      const list = Array.isArray(result.list) ? result.list : [];
      for (const task of list) {
        const id = Number(task.id || task.taskId || 0);
        if (!id) continue;
        const bucket = this.listeners.get(id);
        if (bucket) bucket.forEach(listener => listener(task));
        if (isTaskEnded(task)) this.remove(id);
      }
    } finally {
      this.polling = false;
    }
  }
}

export const taskPoller = new TaskPoller();
