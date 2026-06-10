import { get } from './request';

export function getPlans<T = { list: unknown[] }>(version?: string) {
  return get<T>('/membership/plans', version ? { version } : undefined);
}

export function getPlanDetail<T = Record<string, unknown>>(id: number) {
  return get<T>(`/membership/plans/${id}`);
}

export function getMembershipMe<T = Record<string, unknown>>() {
  return get<T>('/membership/me');
}

export function getPublicMemberPlans<T = { list: unknown[] }>() {
  return get<T>('/shop/member-plans');
}
