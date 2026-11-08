import { moneyCents } from '../policies/automation.mjs';

export function buildReceipt(reservation, resource, payments, capture) {
  const payment = payments.find(
    (p) => p.type === 'PURCHASE_CAPTURE' && p.status === 'CAPTURED',
  );
  if (
    reservation.status !== 'PURCHASED' ||
    !payment?.provider_capture_id ||
    capture?.id !== payment.provider_capture_id ||
    capture.status !== 'COMPLETED' ||
    capture.amount?.value !== payment.amount ||
    capture.amount?.currency_code !== payment.currency
  )
    return null;
  const fee = payments.find(
    (p) => p.type === 'COMMITMENT_FEE' && p.provider_capture_id,
  );
  const refunded = payments
    .filter(
      (p) =>
        p.type === 'COMMITMENT_REFUND' &&
        p.status === 'REFUNDED' &&
        p.currency === payment.currency,
    )
    .reduce((sum, p) => sum + moneyCents(p.amount), 0);
  return {
    reference: reservation.id,
    document_title:
      {
        parking: 'Parking confirmation',
        hotel: 'Hotel booking confirmation',
        restaurant: 'Table booking confirmation',
        item: 'Purchase receipt',
      }[resource.kind] || 'Booking confirmation',
    resource: resource.title,
    merchant: resource.merchant_name,
    sandbox: true,
    paid_at: capture.create_time || reservation.ended_at,
    amount: payment.amount,
    currency: payment.currency,
    paypal_capture_id: capture.id,
    commitment_collected: fee?.amount || '0.00',
    commitment_refunded: (refunded / 100).toFixed(2),
    settlement_status: fee?.status || 'NOT_COLLECTED',
  };
}
