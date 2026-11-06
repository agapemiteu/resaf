import pg from 'pg';
import { createCommitmentOrder, captureOrder, getOrder, refundCapture, getRefund } from '../../integrations/paypal/client.mjs';
import { callbackSignature, voidOutstanding } from './commitment.mjs';
import { ReservationError } from './claims.ts';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

async function owned(id, buyerId) {
  const result = await pool.query(`SELECT r.*, i.price, i.currency AS price_currency FROM reservations r
    JOIN resources i ON i.id = r.resource_id WHERE r.id = $1 AND r.buyer_id = $2 AND i.merchant_id = 'merchant-001'`, [id, buyerId]);
  if (!result.rowCount) throw new ReservationError('NOT_FOUND', 'Reservation does not belong to this buyer.');
  return result.rows[0];
}
async function lock(client, claim) {
  await client.query(`SELECT id FROM resources WHERE id = $1 FOR UPDATE`, [claim.resource_id]);
  const result = await client.query(`SELECT * FROM reservations WHERE id = $1 FOR UPDATE`, [claim.id]);
  return result.rows[0];
}

export async function startPurchase(id, buyerId, baseUrl) {
  const claim = await owned(id, buyerId);
  const client = await pool.connect();
  let payment;
  try {
    await client.query('BEGIN');
    const current = await lock(client, claim);
    if (current.status === 'RESERVED' && new Date(current.expires_at) > new Date()) {
      await client.query(`UPDATE reservations SET status = 'PURCHASE_PENDING', purchase_expires_at = now() + interval '5 minutes' WHERE id = $1`, [id]);
      await client.query(`INSERT INTO payment_transactions (reservation_id,type,amount,currency,status,idempotency_key)
        VALUES ($1,'PURCHASE_CAPTURE',$2,$3,'ORDER_REQUESTED',$4) ON CONFLICT DO NOTHING`,
        [id, claim.price, claim.price_currency, `purchase:${id}`]);
      await client.query(`INSERT INTO reservation_events (reservation_id,event_type) VALUES ($1,'PURCHASE_CHECKOUT_STARTED')`, [id]);
    } else if (current.status !== 'PURCHASE_PENDING' || new Date(current.purchase_expires_at) <= new Date()) {
      throw new ReservationError('CLAIM_EXPIRED', 'A valid reservation is required to start checkout.');
    }
    payment = (await client.query(`SELECT * FROM payment_transactions WHERE idempotency_key = $1`, [`purchase:${id}`])).rows[0];
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  if (payment.provider_order_id) {
    const order = await getOrder(payment.provider_order_id);
    const approvalUrl = order.links?.find(link => ['approve', 'payer-action'].includes(link.rel))?.href;
    if (!approvalUrl) return { reservation_id: id, paypal_order_id: order.id, status: order.status };
    return { reservation_id: id, paypal_order_id: order.id, status: 'APPROVAL_REQUIRED', approval_url: approvalUrl };
  }
  const url = new URL('/paypal/return', baseUrl);
  url.searchParams.set('reservation_id', id); url.searchParams.set('buyer_id', buyerId);
  url.searchParams.set('sig', callbackSignature(id, buyerId)); url.searchParams.set('action', 'purchase');
  const order = await createCommitmentOrder({ reservationId: id, amount: payment.amount, currency: payment.currency,
    intent: 'CAPTURE', operation: 'purchase', returnUrl: url.href, cancelUrl: `${baseUrl}/paypal/cancel` });
  await pool.query(`UPDATE payment_transactions SET provider_order_id = $2, status = 'APPROVAL_REQUIRED' WHERE id = $1`, [payment.id, order.orderId]);
  return { reservation_id: id, paypal_order_id: order.orderId, status: 'APPROVAL_REQUIRED', approval_url: order.approvalUrl };
}

export async function confirmPurchase(id, buyerId, expectedOrderId) {
  const claim = await owned(id, buyerId);
  const payment = (await pool.query(`SELECT * FROM payment_transactions WHERE idempotency_key = $1`, [`purchase:${id}`])).rows[0];
  if (!payment?.provider_order_id) throw new ReservationError('NO_ORDER', 'Purchase checkout has not been created.');
  if (expectedOrderId && expectedOrderId !== payment.provider_order_id) throw new ReservationError('ORDER_MISMATCH', 'Unexpected purchase order.');
  if (claim.status === 'PURCHASED') return { reservation_id: id, status: 'PURCHASED', payment_status: payment.status };
  await pool.query(`UPDATE payment_transactions SET status = 'CAPTURE_REQUESTED' WHERE id = $1 AND status = 'APPROVAL_REQUIRED'`, [payment.id]);
  const client = await pool.connect();
  let capture;
  let purchased = false;
  try {
    await client.query('BEGIN');
    const current = await lock(client, claim);
    if (current.status === 'PURCHASED') {
      await client.query('COMMIT');
      return { reservation_id: id, status: 'PURCHASED', payment_status: 'CAPTURED' };
    }
    const valid = current.status === 'PURCHASE_PENDING' && new Date(current.purchase_expires_at) > new Date();
    if (!valid) {
      // Retrieve only. Never initiate a new capture after checkout expires.
      const order = await getOrder(payment.provider_order_id);
      capture = order.purchase_units?.flatMap(unit => unit.payments?.captures ?? [])[0];
      if (!capture) throw new ReservationError('CLAIM_EXPIRED', 'Purchase checkout has expired.');
    } else {
      capture = (await captureOrder(payment.provider_order_id, `purchase:${id}`)).capture;
      if (!capture) throw new ReservationError('APPROVAL_REQUIRED', 'Purchase approval is required.');
    }
    purchased = valid && capture.status === 'COMPLETED' && capture.amount?.value === payment.amount && capture.amount?.currency_code === payment.currency;
    await client.query(`UPDATE payment_transactions SET provider_capture_id = $2, status = $3 WHERE id = $1`,
      [payment.id, capture.id, purchased ? 'CAPTURED' : 'PURCHASE_REFUND_PENDING']);
    if (purchased) {
      await client.query(`UPDATE resources SET status = 'SOLD' WHERE id = $1`, [claim.resource_id]);
      await client.query(`UPDATE reservations SET status = 'PURCHASED', ended_at = now() WHERE id = $1`, [id]);
      await client.query(`INSERT INTO reservation_events (reservation_id,event_type,event_payload)
        VALUES ($1,'PURCHASE_CAPTURE_CONFIRMED',$2)`, [id, JSON.stringify({ capture_id: capture.id, amount: capture.amount })]);
    } else {
      await client.query(`UPDATE reservations SET status = 'FAILED', ended_at = now() WHERE id = $1 AND status = 'PURCHASE_PENDING'`, [id]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === 'APPROVAL_REQUIRED') await client.query(`UPDATE payment_transactions SET status = 'APPROVAL_REQUIRED' WHERE id = $1`, [payment.id]);
    // CAPTURE_REQUESTED remains recoverable by the scheduled reconciliation loop.
    throw error;
  } finally { client.release(); }
  if (!purchased) {
    await refundFailedPurchase(payment.id);
    throw new ReservationError('PAYMENT_UNRESOLVED', 'Checkout did not complete; payment is being refunded.');
  }
  let settlement;
  try { settlement = await voidOutstanding(id); } catch { settlement = 'SETTLEMENT_PENDING'; }
  return { reservation_id: id, status: 'PURCHASED', payment_status: 'CAPTURED', commitment_status: settlement };
}

async function refundFailedPurchase(paymentId) {
  const p = (await pool.query(`SELECT * FROM payment_transactions WHERE id = $1`, [paymentId])).rows[0];
  if (!p?.provider_capture_id || p.status === 'REFUNDED') return;
  const refund = p.provider_refund_id ? await getRefund(p.provider_refund_id) : await refundCapture({
    captureId: p.provider_capture_id, operationKey: `purchase-refund:${p.reservation_id}`, amount: p.amount, currency: p.currency });
  await pool.query(`UPDATE payment_transactions SET provider_refund_id = $2, status = $3 WHERE id = $1`,
    [p.id, refund.id, refund.status === 'COMPLETED' ? 'REFUNDED' : 'PURCHASE_REFUND_PENDING']);
}

export async function reconcilePurchases() {
  const pending = await pool.query(`SELECT t.*, r.buyer_id FROM payment_transactions t
    JOIN reservations r ON r.id = t.reservation_id WHERE t.type = 'PURCHASE_CAPTURE'
    AND t.status IN ('CAPTURE_REQUESTED','PURCHASE_REFUND_PENDING') LIMIT 50`);
  let failed = 0;
  for (const p of pending.rows) {
    try {
      if (p.status === 'PURCHASE_REFUND_PENDING') await refundFailedPurchase(p.id);
      else {
        const order = await getOrder(p.provider_order_id);
        if (order.purchase_units?.some(unit => unit.payments?.captures?.length)) await confirmPurchase(p.reservation_id, p.buyer_id);
      }
    } catch (error) { if (!['CLAIM_EXPIRED','PAYMENT_UNRESOLVED'].includes(error.code)) failed++; }
  }
  return failed;
}
