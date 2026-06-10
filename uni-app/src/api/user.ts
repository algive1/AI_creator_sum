import { get, post, put } from './request';

export function getMeFull<T = Record<string, unknown>>() {
  return get<T>('/users/me/full', undefined, { loading: false });
}

export function updateMe<T = Record<string, unknown>>(payload: { nickname?: string; avatarUrl?: string; preferences?: Record<string, unknown> }) {
  return put<T>('/users/me', payload, { loading: '保存中' });
}

export function bindPhone<T = Record<string, unknown>>(code: string) {
  return post<T>('/users/me/phone', { code }, { loading: '绑定中' });
}
