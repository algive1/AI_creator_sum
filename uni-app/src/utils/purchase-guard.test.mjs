import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PURCHASE_UNAVAILABLE_MESSAGE,
  canShowProfileMemberEntry,
  canRenderPurchaseUi,
  isPurchaseEnabled,
  shouldBlockPurchase,
} from './purchase-guard.ts';

test('uses neutral page status message while purchase is unavailable', () => {
  assert.equal(PURCHASE_UNAVAILABLE_MESSAGE, 'Page status abnormal, function not found. Please try again.');
});

test('review mode blocks purchase even when payment and membership are enabled', () => {
  const config = {
    reviewModeEnabled: true,
    purchaseEnabled: true,
    paymentEnabled: true,
    membershipEnabled: true,
  };

  assert.equal(isPurchaseEnabled(config), false);
  assert.equal(shouldBlockPurchase(config).blocked, true);
  assert.equal(shouldBlockPurchase(config).message, PURCHASE_UNAVAILABLE_MESSAGE);
});

test('purchase is enabled by default for existing production config', () => {
  assert.equal(isPurchaseEnabled({}), true);
  assert.equal(isPurchaseEnabled({ paymentEnabled: true, membershipEnabled: true }), true);
  assert.equal(shouldBlockPurchase({}).blocked, false);
});

test('explicit purchase disable blocks purchase without requiring review mode', () => {
  const config = { purchaseEnabled: false };

  assert.equal(isPurchaseEnabled(config), false);
  assert.equal(shouldBlockPurchase(config).blocked, true);
});

test('purchase UI waits for public config readiness to prevent flicker', () => {
  assert.equal(canRenderPurchaseUi(false, {}), false);
  assert.equal(canRenderPurchaseUi(true, {}), true);
  assert.equal(canRenderPurchaseUi(true, { reviewModeEnabled: true }), false);
});

test('profile member entry renders for non-member users when purchase is available', () => {
  const config = {
    purchaseEnabled: true,
    membershipEnabled: true,
    profileMemberEntryEnabled: true,
  };

  assert.equal(canShowProfileMemberEntry(true, config), true);
});

test('profile member entry follows review, purchase, membership, and entry switches', () => {
  assert.equal(canShowProfileMemberEntry(false, {}), false);
  assert.equal(canShowProfileMemberEntry(true, { reviewModeEnabled: true, purchaseEnabled: true, membershipEnabled: true }), false);
  assert.equal(canShowProfileMemberEntry(true, { purchaseEnabled: false, membershipEnabled: true }), false);
  assert.equal(canShowProfileMemberEntry(true, { purchaseEnabled: true, membershipEnabled: false }), false);
  assert.equal(canShowProfileMemberEntry(true, { purchaseEnabled: true, membershipEnabled: true, profileMemberEntryEnabled: false }), false);
});
