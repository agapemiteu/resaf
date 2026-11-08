import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePolicy } from '../src/core/policies/config.mjs';

const policy = {
  commitment_amount: '2.00',
  currency: 'USD',
  payment_mode: 'CAPTURE',
  hold_duration_seconds: 600,
  approval_claim_seconds: 300,
  max_active_holds_per_buyer: 1,
  repeat_cooldown_seconds: 3600,
  purchase_refund_bps: 10000,
  release_refund_bps: 5000,
  expiry_refund_bps: 0,
};
test('policy quote accepts exact monetary terms and timezone-aware scheduled changes', () => {
  const result = validatePolicy({
    ...policy,
    effective_at: '2026-11-07T10:00:00+01:00',
  });
  assert.equal(result.effective_at, '2026-11-07T09:00:00.000Z');
  assert.equal(result.release_refund_bps, 5000);
  assert.equal(validatePolicy(policy).effective_at, null);
});
test('reject invalid amounts, percentages, hidden options, and ambiguous scheduling', () => {
  for (const change of [
    { commitment_amount: 2 },
    { commitment_amount: '0.00' },
    { commitment_amount: '2.001' },
    { release_refund_bps: 10001 },
    { hold_duration_seconds: 0 },
    { effective_at: '2026-11-07T10:00:00' },
    { currency: 'EUR' },
    { allow_unlimited_renewals: true },
  ]) {
    assert.throws(() => validatePolicy({ ...policy, ...change }));
  }
});
test('retained fees cannot be configured for authorization-only holds', () => {
  assert.throws(() => validatePolicy({ ...policy, payment_mode: 'AUTHORIZE' }));
  assert.doesNotThrow(() =>
    validatePolicy({
      ...policy,
      payment_mode: 'AUTHORIZE',
      release_refund_bps: 10000,
      expiry_refund_bps: 10000,
    }),
  );
});
