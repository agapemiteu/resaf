import pg from 'pg';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createCommitmentOrder, getOrder, authorizeCommitment, getAuthorization, voidAuthorization } from '../../integrations/paypal/client.mjs';
import { ReservationError } from './claims.ts';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const merchantId = 'merchant-001';

function callbackSignature(reservationId, buyerId) {
  const secret = process.env.CALLBACK_SIGNING_SECRET;
  if (!secret || secret.startsWith('replace-')) throw new Error('Callback signing secret is not configured.');
  return createHmac('sha256', secret).update(`${reservationId}:${buyerId}`).digest('hex');
}

export function verifyCallback(reservationId, buyerId, signature) {
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = Buffer.from(callbackSignature(reservationId, buyerId), 'hex');
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

async function ownedClaim(reservationId, buyerId) {
  const result = await pool.query(`SELECT r.* FROM reservations r JOIN resources i ON i.id = r.resource_id
    WHERE r.id = $1 AND r.buyer_id = $2 AND i.merchant_id = $3`, [reservationId, buyerId, merchantId]);
  if (!result.rowCount) throw new ReservationError('NOT_FOUND', 'Reservation does not belong to this buyer.');
  return result.rows[0];
}

function approvalLink(order) {
  const link = order.links?.find((item) => ['payer-action', 'approve'].includes(item.rel))?.href;
  if (!link) throw new Error('PayPal order has no approval link.');
  const url = new URL(link);
  if (url.protocol !== 'https:' || !/(^|\.)paypal\.com$/i.test(url.hostname)) {
    throw new Error('PayPal returned an invalid approval host.');
  }
  return url.href;
}

export async function startCommitment(reservationId, buyerId, publicBaseUrl) {
  const claim = await ownedClaim(reservationId, buyerId);
  if (claim.status !== 'PENDING_COMMITMENT' || new Date(claim.claim_expires_at) <= new Date()) {
    throw new ReservationError('CLAIM_EXPIRED', 'Approval claim is no longer valid.');
  }
  const existing = await pool.query(`SELECT * FROM payment_transactions WHERE idempotency_key = $1`,
    [`commit:${reservationId}`]);
  if (existing.rows[0]?.provider_order_id) {
    const order = await getOrder(existing.rows[0].provider_order_id);
    return { reservation_id: reservationId, paypal_order_id: order.id,
      approval_url: approvalLink(order), status: 'APPROVAL_REQUIRED' };
  }

  await pool.query(`INSERT INTO payment_transactions
    (reservation_id, type, amount, currency, status, idempotency_key)
    VALUES ($1, 'RESERVATION_AUTHORIZATION', $2, $3, 'ORDER_REQUESTED', $4)
    ON CONFLICT (idempotency_key) DO NOTHING`,
    [reservationId, claim.commitment_amount, claim.currency, `commit:${reservationId}`]);
  const returnUrl = new URL('/paypal/return', publicBaseUrl);
  returnUrl.searchParams.set('reservation_id', reservationId);
  returnUrl.searchParams.set('buyer_id', buyerId);
  returnUrl.searchParams.set('sig', callbackSignature(reservationId, buyerId));
  const order = await createCommitmentOrder({
    reservationId, amount: claim.commitment_amount, currency: claim.currency,
    returnUrl: returnUrl.href, cancelUrl: `${publicBaseUrl}/paypal/cancel`,
  });
  await pool.query(`UPDATE payment_transactions SET provider_order_id = $2, status = 'APPROVAL_REQUIRED'
    WHERE idempotency_key = $1`, [`commit:${reservationId}`, order.orderId]);
  await pool.query(`INSERT INTO reservation_events (reservation_id, event_type, event_payload)
    VALUES ($1, 'PAYPAL_ORDER_CREATED', $2)`, [reservationId, JSON.stringify({ order_id: order.orderId })]);
  return { reservation_id: reservationId, paypal_order_id: order.orderId,
    approval_url: order.approvalUrl, status: 'APPROVAL_REQUIRED' };
}

export async function confirmCommitment(reservationId, buyerId, expectedOrderId) {
  const claim = await ownedClaim(reservationId, buyerId);
  const paymentResult = await pool.query(`SELECT * FROM payment_transactions WHERE idempotency_key = $1`,
    [`commit:${reservationId}`]);
  const payment = paymentResult.rows[0];
  if (!payment?.provider_order_id) throw new ReservationError('NO_ORDER', 'Commitment order has not been created.');
  if (expectedOrderId && expectedOrderId !== payment.provider_order_id) {
    throw new ReservationError('ORDER_MISMATCH', 'PayPal returned an unexpected order.');
  }
  if (claim.status === 'RESERVED' && payment.status === 'AUTHORIZED') {
    if (new Date(claim.expires_at) <= new Date()) {
      throw new ReservationError('CLAIM_EXPIRED', 'Reservation has expired.');
    }
    return { reservation_id: reservationId, status: 'RESERVED', expires_at: claim.expires_at,
      payment_status: 'AUTHORIZED' };
  }
  if (claim.status !== 'PENDING_COMMITMENT') {
    throw new ReservationError('CLAIM_ENDED', 'Claim is no longer pending.');
  }
  if (new Date(claim.claim_expires_at) <= new Date()) {
    throw new ReservationError('CLAIM_EXPIRED', 'Approval claim has expired.');
  }
  const result = await authorizeCommitment(payment.provider_order_id, reservationId);
  if (!result.authorization) throw new ReservationError('APPROVAL_REQUIRED', `PayPal order is ${result.status}.`);
  const authorization = result.authorization;
  if (authorization.status !== 'CREATED' || authorization.amount?.value !== claim.commitment_amount ||
      authorization.amount?.currency_code !== claim.currency) {
    if (authorization.id && authorization.status === 'CREATED') {
      await pool.query(`UPDATE payment_transactions SET provider_authorization_id = $2, status = 'VOID_PENDING'
        WHERE idempotency_key = $1`, [`commit:${reservationId}`, authorization.id]);
      await voidOutstanding(reservationId);
    }
    throw new Error('PayPal authorization did not match the required commitment.');
  }

  const client = await pool.connect();
  let activated = null;
  try {
    await client.query('BEGIN');
    const locked = await client.query(`SELECT r.* FROM reservations r JOIN resources i ON i.id = r.resource_id
      WHERE r.id = $1 AND i.merchant_id = $2 FOR UPDATE OF r`, [reservationId, merchantId]);
    const current = locked.rows[0];
    if (current?.status === 'RESERVED' && new Date(current.expires_at) > new Date()) {
      activated = { expires_at: current.expires_at };
    } else if (current?.status === 'PENDING_COMMITMENT' && new Date(current.claim_expires_at) > new Date()) {
      const policy = await client.query(`SELECT hold_duration_seconds FROM reservation_policies WHERE id = $1`,
        [current.policy_id]);
      const updated = await client.query(`UPDATE reservations SET status = 'RESERVED', activated_at = now(),
        expires_at = now() + ($2::integer * interval '1 second') WHERE id = $1 RETURNING expires_at`,
        [reservationId, policy.rows[0].hold_duration_seconds]);
      activated = updated.rows[0];
      await client.query(`INSERT INTO reservation_events (reservation_id, event_type, event_payload)
        VALUES ($1, 'RESERVATION_ACTIVATED', $2)`,
        [reservationId, JSON.stringify({ authorization_id: authorization.id })]);
    }
    await client.query(`UPDATE payment_transactions SET provider_authorization_id = $2,
      status = $3 WHERE idempotency_key = $1`,
      [`commit:${reservationId}`, authorization.id, activated ? 'AUTHORIZED' : 'VOID_PENDING']);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    try {
      await pool.query(`UPDATE payment_transactions SET provider_authorization_id = $2, status = 'VOID_PENDING'
        WHERE idempotency_key = $1`, [`commit:${reservationId}`, authorization.id]);
      await voidOutstanding(reservationId);
    } catch (cleanupError) {
      console.error('Authorization cleanup needs reconciliation:', cleanupError);
    }
    throw error;
  } finally {
    client.release();
  }
  if (!activated) {
    await voidOutstanding(reservationId);
    throw new ReservationError('CLAIM_EXPIRED', 'Claim ended during PayPal approval; authorization was voided.');
  }
  return { reservation_id: reservationId, status: 'RESERVED', expires_at: activated.expires_at,
    payment_status: 'AUTHORIZED' };
}

export async function voidOutstanding(reservationId) {
  const paymentResult = await pool.query(`SELECT * FROM payment_transactions WHERE idempotency_key = $1`,
    [`commit:${reservationId}`]);
  const payment = paymentResult.rows[0];
  if (!payment?.provider_authorization_id || payment.status === 'VOIDED') return payment?.status ?? null;
  await pool.query(`UPDATE payment_transactions SET status = 'VOID_PENDING' WHERE id = $1`, [payment.id]);
  try {
    let verified;
    try { verified = await voidAuthorization(payment.provider_authorization_id, reservationId); }
    catch { verified = await getAuthorization(payment.provider_authorization_id); }
    if (verified.status !== 'VOIDED') throw new Error(`Authorization is ${verified.status}.`);
    await pool.query(`UPDATE payment_transactions SET status = 'VOIDED' WHERE id = $1`, [payment.id]);
    await pool.query(`INSERT INTO reservation_events (reservation_id, event_type)
      VALUES ($1, 'AUTHORIZATION_VOID_CONFIRMED')`, [reservationId]);
    return 'VOIDED';
  } catch (error) {
    await pool.query(`UPDATE payment_transactions SET status = 'VOID_FAILED' WHERE id = $1`, [payment.id]);
    throw error;
  }
}
