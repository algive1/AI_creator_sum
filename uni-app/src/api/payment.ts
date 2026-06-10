import { payWithWechat, post } from './request';

export function createOrder<T = Record<string, unknown>>(orderType: 'points' | 'membership', productId: number) {
  return post<T>('/orders', { orderType, productId }, { loading: '创建订单' });
}

export function payOrder(orderNo: string) {
  return payWithWechat(orderNo);
}
