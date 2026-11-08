import test from 'node:test';
import assert from 'node:assert/strict';
import { refundAmount } from '../src/core/payments/fee-policy.mjs';

test('full, partial, and retained fees use exact cents', () => {
  assert.equal(refundAmount('2.00', 10000), '2.00');
  assert.equal(refundAmount('2.00', 2500), '0.50');
  assert.equal(refundAmount('2.00', 0), '0.00');
});
test('fractional cents round down and never exceed the captured amount', () => {
  assert.equal(refundAmount('0.01', 5000), '0.00');
  assert.equal(refundAmount('9999999999.99', 9999), '9998999999.99');
});
test('invalid money and refund percentages are rejected', () => {
  for (const [amount, bps] of [
    ['-2.00', 100],
    ['2.001', 100],
    ['2.00', 10001],
    ['2.00', -1],
    ['2.00', 0.5],
  ]) {
    assert.throws(() => refundAmount(amount, bps));
  }
});
