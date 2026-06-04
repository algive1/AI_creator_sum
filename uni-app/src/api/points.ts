import { get } from './request';

export function getBalance<T = Record<string, unknown>>() {
  return get<T>('/points/balance');
}

export function getTransactions<T = Record<string, unknown>>(params?: Record<string, unknown>) {
  return get<T>('/points/transactions', params);
}

export function getPointPackages<T = Record<string, unknown>>() {
  return get<T>('/shop/point-packages');
}
