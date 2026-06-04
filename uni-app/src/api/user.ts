import { get, put } from './request';

export function getMe<T = Record<string, unknown>>() {
  return get<T>('/users/me');
}

export function getMeFull<T = Record<string, unknown>>() {
  return get<T>('/users/me/full', undefined, { loading: false });
}

export function updateMe<T = Record<string, unknown>>(payload: { nickname?: string; avatarUrl?: string; preferences?: Record<string, unknown> }) {
  return put<T>('/users/me', payload, { loading: '保存中' });
}
