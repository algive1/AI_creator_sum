import { get } from './request';

export function getInviteCode<T = Record<string, unknown>>() {
  return get<T>('/invite/my-code');
}

export function getInviteSummary<T = Record<string, unknown>>() {
  return get<T>('/invite/summary');
}

export function getInviteRecords<T = Record<string, unknown>>(params?: Record<string, unknown>) {
  return get<T>('/invite/records', params);
}
