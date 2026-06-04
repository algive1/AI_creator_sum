import { get, post } from './request';

export function getTasks<T = Record<string, unknown>>(params?: Record<string, unknown>) {
  return get<T>('/tasks', params, { silent: true });
}

export function getTaskDetail<T = Record<string, unknown>>(id: number) {
  return get<T>(`/tasks/${id}`, undefined, { silent: true });
}

export function cancelTask<T = Record<string, unknown>>(id: number) {
  return post<T>(`/tasks/${id}/cancel`, undefined, { loading: '取消任务' });
}
