import { payWithWechat, post } from './request';
import { useConfigStore } from '@/stores/config';
import { shouldBlockPurchase, showPurchaseUnavailable } from '@/utils/purchase-guard';

export function createOrder<T = Record<string, unknown>>(orderType: 'points' | 'membership', productId: number) {
  const configStore = useConfigStore();
  const guard = shouldBlockPurchase(configStore.publicConfig);
  if (guard.blocked) {
    showPurchaseUnavailable(configStore.publicConfig);
    return Promise.reject(new Error(guard.message));
  }
  return post<T>('/orders', { orderType, productId }, { loading: '创建订单' });
}

export function payOrder(orderNo: string) {
  const configStore = useConfigStore();
  const guard = shouldBlockPurchase(configStore.publicConfig);
  if (guard.blocked) {
    showPurchaseUnavailable(configStore.publicConfig);
    return Promise.reject(new Error(guard.message));
  }
  return payWithWechat(orderNo);
}
