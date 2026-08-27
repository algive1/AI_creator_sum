import { get } from './request';
import { normalizeFreeImageQuotaStatus, type FreeImageQuotaView } from '@/utils/free-image-quota';

export interface FreeImageQuotaStatus extends FreeImageQuotaView {
  enabled: boolean;
  eligible: boolean;
  canUseFreeQuota: boolean;
  dailyRemaining: number;
  dailyLimit: number;
  totalRemaining: number;
  totalLimit: number;
  remaining: number;
  showInDailyTasks: boolean;
  exhaustedMessage: string;
  membershipEnabled: boolean;
  purchaseEnabled: boolean;
}

export function getMyFreeImageQuota() {
  return get<FreeImageQuotaStatus>('/free-image-quota/me', undefined, { silent: true })
    .then((status) => normalizeFreeImageQuotaStatus(status) as FreeImageQuotaStatus);
}
