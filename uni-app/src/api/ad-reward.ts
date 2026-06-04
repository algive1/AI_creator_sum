import { get, post } from './request';

export function getAdRewardStatus<T = Record<string, unknown>>() {
  return get<T>('/ads/status');
}

export function createAdRewardSession<T = Record<string, unknown>>() {
  return post<T>('/ads/session', undefined, { loading: '准备广告奖励' });
}

export function claimAdReward<T = Record<string, unknown>>(sessionId: string, completed = true) {
  return post<T>('/ads/reward', { sessionId, completed }, { loading: '领取奖励' });
}
