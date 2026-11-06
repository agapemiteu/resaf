export function moneyCents(amount) {
  if (typeof amount !== 'string' || !/^\d{1,8}\.\d{2}$/.test(amount)) throw new Error('Expected an amount with two decimal places.');
  const [whole, cents] = amount.split('.');
  return Number(whole) * 100 + Number(cents);
}
export function validateAutomation(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('automation must be an object or null.');
  const allowed = ['min_amount', 'max_amount', 'step_amount', 'raise_at', 'lower_at', 'window_seconds', 'cooldown_seconds'];
  if (Object.keys(value).some(k => !allowed.includes(k))) throw new Error('Unknown automation setting.');
  const min = moneyCents(value.min_amount), max = moneyCents(value.max_amount), step = moneyCents(value.step_amount);
  if (min < 1 || max < min || step < 1 || step > max) throw new Error('Invalid automation amount bounds.');
  if (!Number.isInteger(value.lower_at) || value.lower_at < 0 || !Number.isInteger(value.raise_at) || value.raise_at <= value.lower_at) {
    throw new Error('raise_at must exceed lower_at; both must be nonnegative integer demand counts.');
  }
  for (const key of ['window_seconds', 'cooldown_seconds']) {
    if (!Number.isInteger(value[key]) || value[key] < 60 || value[key] > 86400) throw new Error(`${key} must be 60–86400 seconds.`);
  }
  return Object.fromEntries(allowed.map(k => [k, value[k]]));
}
export function nextCommitment(policy, paidReservations) {
  const rule = policy.automation;
  if (!rule) return policy.commitment_amount;
  let cents = moneyCents(policy.commitment_amount);
  if (paidReservations >= rule.raise_at) cents += moneyCents(rule.step_amount);
  else if (paidReservations <= rule.lower_at) cents -= moneyCents(rule.step_amount);
  cents = Math.min(moneyCents(rule.max_amount), Math.max(moneyCents(rule.min_amount), cents));
  return (cents / 100).toFixed(2);
}
