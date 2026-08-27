import test from 'node:test';
import assert from 'node:assert/strict';

const commerceAvailability = await import('../src/services/commerce-availability.service.ts');

const {
  PURCHASE_UNAVAILABLE_MESSAGE,
  buildCommerceAvailability,
} = commerceAvailability;

test('uses neutral page status message while purchase is unavailable', () => {
  assert.equal(PURCHASE_UNAVAILABLE_MESSAGE, 'Page status abnormal, function not found. Please try again.');
});

test('review mode disables all purchase-facing commerce flags', () => {
  const availability = buildCommerceAvailability({
    reviewModeEnabled: true,
    paymentEnabled: true,
    membershipEnabled: true,
  });

  assert.equal(availability.reviewModeEnabled, true);
  assert.equal(availability.purchaseEnabled, false);
  assert.equal(availability.paymentEnabled, false);
  assert.equal(availability.membershipEnabled, false);
  assert.equal(availability.message, PURCHASE_UNAVAILABLE_MESSAGE);
});

test('commerce remains enabled when review mode is off and existing switches are enabled', () => {
  const availability = buildCommerceAvailability({
    reviewModeEnabled: false,
    paymentEnabled: true,
    membershipEnabled: true,
  });

  assert.equal(availability.purchaseEnabled, true);
  assert.equal(availability.paymentEnabled, true);
  assert.equal(availability.membershipEnabled, true);
});
