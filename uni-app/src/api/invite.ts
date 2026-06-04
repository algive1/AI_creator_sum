import { get, post } from './request';

export function getInviteCode<T = Record<string, unknown>>() {
  return get<T>('/invite/my-code');
}

export function bindInviteCode<T = Record<string, unknown>>(inviteCode: string) {
  return post<T>('/invite/bind', { inviteCode }, { loading: '绑定邀请码' });
}

export function getInviteSummary<T = Record<string, unknown>>() {
  return get<T>('/invite/summary');
}

export function getInviteRecords<T = Record<string, unknown>>(params?: Record<string, unknown>) {
  return get<T>('/invite/records', params);
}
