import test from 'node:test';
import assert from 'node:assert/strict';

const timeoutRecovery = await import('../src/services/task-timeout-recovery.service.ts');

const { planRecoveredTimeoutTaskSettlement } = timeoutRecovery;

test('recovered full success debits refunded points and allows negative balance', () => {
  const plan = planRecoveredTimeoutTaskSettlement({
    currentBalance: 3,
    frozenBalance: 0,
    requestedPointsCost: 10,
    actualPointsCost: 10,
    previousPointsRefunded: 10,
    correctionAlreadyApplied: false,
  });

  assert.deepEqual(plan, {
    balanceAfter: -7,
    debitAmount: 10,
    creditAmount: 0,
    netRefundPoints: 0,
    totalSpentDelta: 10,
    totalRefundedDelta: -10,
    shouldWriteCorrectionLog: true,
  });
});

test('recovered partial image success keeps ungenerated image refund', () => {
  const plan = planRecoveredTimeoutTaskSettlement({
    currentBalance: 3,
    frozenBalance: 0,
    requestedPointsCost: 10,
    actualPointsCost: 6,
    previousPointsRefunded: 10,
    correctionAlreadyApplied: false,
  });

  assert.equal(plan.balanceAfter, -3);
  assert.equal(plan.debitAmount, 6);
  assert.equal(plan.creditAmount, 0);
  assert.equal(plan.netRefundPoints, 4);
  assert.equal(plan.totalSpentDelta, 6);
  assert.equal(plan.totalRefundedDelta, -6);
  assert.equal(plan.shouldWriteCorrectionLog, true);
});

test('recovery settlement is idempotent after correction log exists', () => {
  const plan = planRecoveredTimeoutTaskSettlement({
    currentBalance: -7,
    frozenBalance: 0,
    requestedPointsCost: 10,
    actualPointsCost: 10,
    previousPointsRefunded: 0,
    correctionAlreadyApplied: true,
  });

  assert.deepEqual(plan, {
    balanceAfter: -7,
    debitAmount: 0,
    creditAmount: 0,
    netRefundPoints: 0,
    totalSpentDelta: 0,
    totalRefundedDelta: 0,
    shouldWriteCorrectionLog: false,
  });
});
