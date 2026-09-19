import { defineStore } from 'pinia';
import { getTaskDetail, getTasks } from '@/api/task';
import { isTaskProcessing } from '@/utils/task-display';
import { taskPoller } from '@/utils/task-poller';

interface TaskState {
  list: Record<string, unknown>[];
  pagination: Record<string, unknown> | null;
  currentTask: Record<string, unknown> | null;
  loading: boolean;
}

let stopCurrentTaskPolling: (() => void) | null = null;

export const useTaskStore = defineStore('task', {
  state: (): TaskState => ({
    list: [],
    pagination: null,
    currentTask: null,
    loading: false
  }),
  actions: {
    async loadTasks(params: Record<string, unknown> = {}) {
      this.loading = true;
      try {
        const result = await getTasks<Record<string, unknown>>({ page: 1, pageSize: 20, ...params });
        const dataList = (result.list || result.records || []) as Record<string, unknown>[];
        this.list = Array.isArray(dataList) ? dataList : [];
        this.pagination = (result.pagination || null) as Record<string, unknown> | null;
        this.currentTask = this.list.find((item) => isTaskProcessing(item)) || this.list[0] || null;
        return result;
      } finally {
        this.loading = false;
      }
    },
    async loadTask(id: number) {
      const task = await getTaskDetail<Record<string, unknown>>(id);
      this.currentTask = task;
      return task;
    },
    startPolling(id: number, _interval = 3000) {
      stopCurrentTaskPolling?.();
      stopCurrentTaskPolling = taskPoller.add(id, (task) => {
        this.currentTask = task;
      });
      taskPoller.pollNow().catch(() => undefined);
    },
    stopPolling() {
      stopCurrentTaskPolling?.();
      stopCurrentTaskPolling = null;
    }
  }
});
