import { defineStore } from 'pinia';
import { getTaskDetail, getTasks } from '@/api/task';
import { isTaskProcessing } from '@/utils/task-display';

interface TaskState {
  list: Record<string, unknown>[];
  pagination: Record<string, unknown> | null;
  currentTask: Record<string, unknown> | null;
  loading: boolean;
  pollTimer: ReturnType<typeof setInterval> | null;
}

export const useTaskStore = defineStore('task', {
  state: (): TaskState => ({
    list: [],
    pagination: null,
    currentTask: null,
    loading: false,
    pollTimer: null
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
    startPolling(id: number, interval = 3000) {
      this.stopPolling();
      this.pollTimer = setInterval(() => {
        this.loadTask(id).catch(() => undefined);
      }, interval);
    },
    stopPolling() {
      if (this.pollTimer) clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
});
