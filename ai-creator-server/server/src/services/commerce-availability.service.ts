import { SettingsService } from './settings.service';

export const PURCHASE_UNAVAILABLE_MESSAGE = 'Page status abnormal, function not found. Please try again.';

export interface CommerceAvailabilityInput {
  reviewModeEnabled: boolean;
  paymentEnabled: boolean;
  membershipEnabled: boolean;
  purchaseEnabled?: boolean;
}

export interface CommerceAvailability {
  reviewModeEnabled: boolean;
  purchaseEnabled: boolean;
  paymentEnabled: boolean;
  membershipEnabled: boolean;
  message: string;
}

export function buildCommerceAvailability(input: CommerceAvailabilityInput): CommerceAvailability {
  const purchaseEnabled = input.reviewModeEnabled ? false : input.purchaseEnabled !== false;
  return {
    reviewModeEnabled: input.reviewModeEnabled,
    purchaseEnabled,
    paymentEnabled: purchaseEnabled && input.paymentEnabled,
    membershipEnabled: purchaseEnabled && input.membershipEnabled,
    message: purchaseEnabled ? '' : PURCHASE_UNAVAILABLE_MESSAGE,
  };
}

export async function getCommerceAvailability(): Promise<CommerceAvailability> {
  return buildCommerceAvailability({
    reviewModeEnabled: await SettingsService.getBoolean('miniapp.review_mode_enabled', false),
    purchaseEnabled: await SettingsService.getBoolean('miniapp.purchase_enabled', true),
    paymentEnabled: await SettingsService.getBoolean('wechat_pay.enabled', false),
    membershipEnabled: await SettingsService.getBoolean('membership.enabled', false),
  });
}

export async function ensurePurchaseEnabled(): Promise<void> {
  const availability = await getCommerceAvailability();
  if (!availability.purchaseEnabled) {
    throw Object.assign(new Error(PURCHASE_UNAVAILABLE_MESSAGE), { code: 403 });
  }
}
