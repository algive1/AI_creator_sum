export const PURCHASE_UNAVAILABLE_MESSAGE = 'Page status abnormal, function not found. Please try again.';

export interface PurchaseGuardResult {
  blocked: boolean;
  message: string;
}

export function isReviewModeEnabled(config: unknown) {
  const root = asRecord(config);
  return root.reviewModeEnabled === true || root['miniapp.review_mode_enabled'] === true;
}

export function isPurchaseEnabled(config: unknown) {
  const root = asRecord(config);
  if (isReviewModeEnabled(root)) return false;
  if (root.purchaseEnabled === false || root['miniapp.purchase_enabled'] === false) return false;
  return true;
}

export function canRenderPurchaseUi(configReady: boolean, config: unknown) {
  return configReady && isPurchaseEnabled(config);
}

export function canShowProfileMemberEntry(configReady: boolean, config: unknown) {
  const root = asRecord(config);
  if (!canRenderPurchaseUi(configReady, root)) return false;
  if (root.membershipEnabled === false || root['membership.enabled'] === false) return false;
  if (root.profileMemberEntryEnabled === false || root['miniapp.profile_member_entry_enabled'] === false) return false;
  return true;
}

export function shouldBlockPurchase(config: unknown): PurchaseGuardResult {
  if (isPurchaseEnabled(config)) return { blocked: false, message: '' };
  const root = asRecord(config);
  const message = String(root.purchaseMessage || root.purchaseDisabledMessage || '').trim();
  return { blocked: true, message: message || PURCHASE_UNAVAILABLE_MESSAGE };
}

export function showPurchaseUnavailable(config: unknown) {
  uni.showToast({ title: shouldBlockPurchase(config).message, icon: 'none' });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
