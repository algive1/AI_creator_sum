import { get } from './request';

export function getPointTasks<T = Record<string, unknown>>() {
  return get<T>('/point-tasks');
}
