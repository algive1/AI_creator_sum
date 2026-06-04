import { get, post } from './request';

export function getSignInStatus<T = Record<string, unknown>>() {
  return get<T>('/checkin/status');
}

export function normalSignIn<T = Record<string, unknown>>() {
  return post<T>('/checkin/normal', undefined, { loading: '签到中' });
}

export function superSignIn<T = Record<string, unknown>>() {
  return post<T>('/checkin/super', undefined, { loading: '签到中' });
}

export function makeupSignIn<T = Record<string, unknown>>(targetDate?: string) {
  return post<T>('/checkin/makeup', targetDate ? { targetDate } : undefined, { loading: '补签中' });
}
