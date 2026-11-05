export function refundAmount(amount, basisPoints) {
  if (!/^\d{1,10}\.\d{2}$/.test(amount) || !Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) {
    throw new Error('Invalid commitment settlement terms.');
  }
  const [whole, fraction] = amount.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction);
  const refund = cents * BigInt(basisPoints) / 10000n;
  return `${refund / 100n}.${String(refund % 100n).padStart(2, '0')}`;
}

export function settlementTerms(policy) {
  return {
    payment_mode: policy.payment_mode,
    purchase_refund_bps: policy.purchase_refund_bps,
    release_refund_bps: policy.release_refund_bps,
    expiry_refund_bps: policy.expiry_refund_bps,
  };
}
