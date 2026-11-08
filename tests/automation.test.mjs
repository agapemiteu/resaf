import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateAutomation,
  nextCommitment,
} from '../src/core/policies/automation.mjs';
const rule = {
  min_amount: '1.00',
  max_amount: '3.00',
  step_amount: '0.50',
  raise_at: 3,
  lower_at: 0,
  window_seconds: 3600,
  cooldown_seconds: 300,
};
test('business rules increase and decrease commitment within configured limits', () => {
  const policy = {
    commitment_amount: '2.00',
    automation: validateAutomation(rule),
  };
  assert.equal(nextCommitment(policy, 3), '2.50');
  assert.equal(nextCommitment(policy, 0), '1.50');
  assert.equal(nextCommitment(policy, 1), '2.00');
  assert.equal(
    nextCommitment({ ...policy, commitment_amount: '3.00' }, 99),
    '3.00',
  );
  assert.equal(
    nextCommitment({ ...policy, commitment_amount: '1.00' }, 0),
    '1.00',
  );
});
test('reject invalid rule bounds, intervals, and contradictory thresholds', () => {
  for (const value of [
    { ...rule, max_amount: '0.50' },
    { ...rule, step_amount: '0.00' },
    { ...rule, raise_at: 0 },
    { ...rule, cooldown_seconds: 0 },
    { ...rule, arbitrary_script: 'run' },
  ]) {
    assert.throws(() => validateAutomation(value));
  }
  assert.equal(validateAutomation(null), null);
});
