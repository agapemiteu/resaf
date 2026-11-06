import pg from 'pg';
import { captureOrder, refundCapture, getRefund, getCapture, getOrder } from '../../integrations/paypal/client.mjs';
import { refundAmount } from '../payments/fee-policy.mjs';
import { ReservationError } from './claims.ts';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });

export async function reconcileFeeCaptures() {
  const unresolved = await pool.query(`SELECT t.id, t.provider_order_id FROM payment_transactions t
    JOIN reservations r ON r.id = t.reservation_id
    WHERE t.type = 'COMMITMENT_FEE' AND t.status = 'CAPTURE_REQUESTED'
      AND t.provider_capture_id IS NULL AND r.status IN ('EXPIRED', 'RELEASED', 'FAILED') LIMIT 100`);
  for (const payment of unresolved.rows) {
    const order = await getOrder(payment.provider_order_id);
    const captureId = order.purchase_units?.flatMap((unit) => unit.payments?.captures ?? [])[0]?.id;
    if (!captureId) continue; // An uncertain provider outcome stays recoverable.
    const capture = await getCapture(captureId);
    await pool.query(`UPDATE payment_transactions SET provider_capture_id = $2,
      amount = $3, currency = $4, status = 'CAPTURE_RECONCILE' WHERE id = $1`,
      [payment.id, capture.id, capture.amount.value, capture.amount.currency_code]);
    // A capture without a confirmed reservation must be refunded in full.
    await pool.query(`UPDATE reservations SET status = 'FAILED' WHERE id =
      (SELECT reservation_id FROM payment_transactions WHERE id = $1) AND activated_at IS NULL`, [payment.id]);
  }
}

export async function confirmFee(claim, payment) {
  await pool.query(`UPDATE payment_transactions SET status = 'CAPTURE_REQUESTED'
    WHERE id = $1 AND status IN ('APPROVAL_REQUIRED', 'CAPTURE_REQUESTED')`, [payment.id]);
  const client = await pool.connect();
  let captured;
  let active;
  try {
    await client.query('BEGIN');
    const locked = await client.query(`SELECT r.*, p.hold_duration_seconds FROM reservations r
      JOIN reservation_policies p ON p.id = r.policy_id WHERE r.id = $1 FOR UPDATE OF r`, [claim.id]);
    const current = locked.rows[0];
    if (current.status === 'RESERVED' && new Date(current.expires_at) > new Date()) {
      await client.query('COMMIT');
      return { reservation_id: claim.id, status: 'RESERVED', expires_at: current.expires_at, payment_status: 'CAPTURED' };
    }
    if (current.status !== 'PENDING_COMMITMENT' || new Date(current.claim_expires_at) <= new Date()) {
      throw new ReservationError('CLAIM_EXPIRED', 'Approval claim has ended.');
    }
    const result = await captureOrder(payment.provider_order_id, claim.id);
    captured = result.capture;
    if (!captured) throw new ReservationError('APPROVAL_REQUIRED', `PayPal order is ${result.status}.`);
    // Persist even a pending capture; only verified completed payments grant exclusivity.
    await client.query(`UPDATE payment_transactions SET provider_capture_id = $2, status = $3,
      amount = $4, currency = $5 WHERE id = $1`,
      [payment.id, captured.id, captured.status === 'COMPLETED' ? 'CAPTURED' : 'CAPTURE_PENDING',
        captured.amount.value, captured.amount.currency_code]);
    if (captured.status !== 'COMPLETED' || captured.amount?.value !== claim.commitment_amount ||
        captured.amount?.currency_code !== claim.currency) {
      await client.query(`UPDATE reservations SET status = 'FAILED', ended_at = now() WHERE id = $1`, [claim.id]);
    } else {
      const updated = await client.query(`UPDATE reservations SET status = 'RESERVED', activated_at = clock_timestamp(),
        expires_at = clock_timestamp() + ($2::integer * interval '1 second')
        WHERE id = $1 AND claim_expires_at > clock_timestamp() RETURNING expires_at`,
        [claim.id, current.hold_duration_seconds]);
      active = updated.rows[0];
      if (!active) await client.query(`UPDATE reservations SET status = 'FAILED', ended_at = now() WHERE id = $1`, [claim.id]);
      await client.query(`INSERT INTO reservation_events (reservation_id, event_type, event_payload)
        VALUES ($1, $2, $3)`, [claim.id, active ? 'COMMITMENT_CAPTURE_CONFIRMED' : 'CAPTURE_REQUIRES_REFUND',
        JSON.stringify({ capture_id: captured.id, amount: captured.amount })]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof ReservationError && error.code === 'APPROVAL_REQUIRED') {
      await client.query(`UPDATE payment_transactions SET status = 'APPROVAL_REQUIRED' WHERE id = $1`, [payment.id]);
    }
    if (captured?.id) {
      await client.query(`UPDATE payment_transactions SET provider_capture_id = $2, status = 'CAPTURE_RECONCILE' WHERE id = $1`, [payment.id, captured.id]);
      await client.query(`UPDATE reservations SET status = 'FAILED', ended_at = now() WHERE id = $1 AND status = 'PENDING_COMMITMENT'`, [claim.id]);
    }
    throw error;
  } finally { client.release(); }
  if (!active) {
    if (captured?.status === 'COMPLETED') await settleFee(claim.id);
    throw new ReservationError('PAYMENT_UNRESOLVED', 'Payment did not activate a reservation; settlement is being reconciled.');
  }
  return { reservation_id: claim.id, status: 'RESERVED', expires_at: active.expires_at, payment_status: 'CAPTURED' };
}

export async function settleFee(reservationId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`SELECT t.*, r.status AS reservation_status,
      p.purchase_refund_bps, p.release_refund_bps, p.expiry_refund_bps
      FROM payment_transactions t JOIN reservations r ON r.id = t.reservation_id
      JOIN reservation_policies p ON p.id = r.policy_id
      WHERE t.idempotency_key = $1 FOR UPDATE OF t`, [`commit:${reservationId}`]);
    const payment = result.rows[0];
    if (!payment?.provider_capture_id) { await client.query('COMMIT'); return null; }
    if (payment.status === 'SETTLED') { await client.query('COMMIT'); return 'SETTLED'; }
    const capture = await getCapture(payment.provider_capture_id);
    if (['PENDING', 'DECLINED', 'FAILED'].includes(capture.status)) {
      const status = capture.status === 'PENDING' ? 'CAPTURE_PENDING' : 'SETTLED';
      await client.query(`UPDATE payment_transactions SET status = $2 WHERE id = $1`, [payment.id, status]);
      await client.query('COMMIT');
      return status;
    }
    const bps = { PURCHASED: payment.purchase_refund_bps, RELEASED: payment.release_refund_bps,
      EXPIRED: payment.expiry_refund_bps, FAILED: 10000 }[payment.reservation_status];
    if (bps === undefined) throw new Error('Only terminal reservations may settle a commitment fee.');
    const amount = refundAmount(payment.amount, bps);
    const key = `settle:${reservationId}`;
    if (amount !== '0.00') {
      await client.query(`INSERT INTO payment_transactions
        (reservation_id, type, provider_capture_id, amount, currency, status, idempotency_key)
        VALUES ($1, 'COMMITMENT_REFUND', $2, $3, $4, 'REFUND_PENDING', $5) ON CONFLICT DO NOTHING`,
        [reservationId, payment.provider_capture_id, amount, payment.currency, key]);
      const existing = await client.query(`SELECT * FROM payment_transactions WHERE idempotency_key = $1`, [key]);
      const saved = existing.rows[0];
      const refund = saved.provider_refund_id ? await getRefund(saved.provider_refund_id) : await refundCapture({
        captureId: payment.provider_capture_id, operationKey: key, amount, currency: payment.currency });
      await client.query(`UPDATE payment_transactions SET provider_refund_id = $2, status = $3 WHERE id = $1`,
        [saved.id, refund.id, refund.status === 'COMPLETED' ? 'REFUNDED' : 'REFUND_PENDING']);
      if (refund.status !== 'COMPLETED') { await client.query('COMMIT'); return 'REFUND_PENDING'; }
    }
    await client.query(`UPDATE payment_transactions SET status = 'SETTLED' WHERE id = $1`, [payment.id]);
    await client.query(`INSERT INTO reservation_events (reservation_id, event_type, event_payload)
      VALUES ($1, 'COMMITMENT_SETTLED', $2)`, [reservationId, JSON.stringify({ captured: payment.amount,
      refunded: amount, currency: payment.currency, outcome: payment.reservation_status })]);
    await client.query('COMMIT');
    return 'SETTLED';
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
