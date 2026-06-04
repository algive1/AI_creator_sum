import { get, payWithWechat, post } from './request';

export function createOrder<T = Record<string, unknown>>(orderType: 'points' | 'membership', productId: number) {
  return post<T>('/orders', { orderType, productId }, { loading: '创建订单' });
}

export function getOrders<T = Record<string, unknown>>(params?: Record<string, unknown>) {
  return get<T>('/orders', params);
}

export function getOrder<T = Record<string, unknown>>(orderNo: string) {
  return get<T>(`/orders/${orderNo}`);
}

export function cancelOrder<T = Record<string, unknown>>(orderNo: string) {
  return post<T>(`/orders/${orderNo}/cancel`, undefined, { loading: '取消订单' });
}

export function startWechatPay<T = Record<string, unknown>>(orderNo: string) {
  return post<T>('/payments/wechat/jsapi', { orderNo }, { loading: '准备支付' });
}

export function queryWechatPay<T = Record<string, unknown>>(orderNo: string) {
  return post<T>('/payments/wechat/query', { orderNo }, { loading: '查询支付结果' });
}

export function payOrder(orderNo: string) {
  return payWithWechat(orderNo);
}
