import pg from 'pg';
import { verifyWebhook, getCapture, getAuthorization, getRefund } from './client.mjs';
import { confirmCommitment } from '../../core/reservations/commitment.mjs';
import { confirmPurchase } from '../../core/reservations/purchase.mjs';
import { resumeAgentAfterPayment } from '../../agents/shopper.mjs';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });

export async function receiveWebhook(headers, event) {
  if (!event || typeof event.id !== 'string' || typeof event.event_type !== 'string' || !await verifyWebhook(headers, event)) return false;
  await pool.query(`INSERT INTO paypal_webhook_events (id,event_type,payload) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
    [event.id, event.event_type, JSON.stringify(event)]);
  return true;
}

export async function processWebhookEvents() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pending = await client.query(`SELECT * FROM paypal_webhook_events WHERE status <> 'PROCESSED'
      AND attempts < 10 ORDER BY created_at LIMIT 5 FOR UPDATE SKIP LOCKED`);
    for (const item of pending.rows) {
      await client.query('SAVEPOINT webhook_event');
      try {
        const e = item.payload, resource = e.resource || {};
        const orderId = e.event_type === 'CHECKOUT.ORDER.APPROVED' ? resource.id : resource.supplementary_data?.related_ids?.order_id;
        const match = await client.query(`SELECT t.*,r.buyer_id FROM payment_transactions t JOIN reservations r ON r.id = t.reservation_id
          WHERE t.provider_order_id = $1 OR t.provider_capture_id = $2 OR t.provider_authorization_id = $2 OR t.provider_refund_id = $2
          ORDER BY CASE WHEN t.type IN ('COMMITMENT_FEE','RESERVATION_AUTHORIZATION','PURCHASE_CAPTURE') THEN 0 ELSE 1 END LIMIT 1`,
          [orderId || null, resource.id || null]);
        const payment = match.rows[0];
        if (payment && ['CHECKOUT.ORDER.APPROVED','PAYMENT.CAPTURE.COMPLETED'].includes(e.event_type)) {
          const purchase = payment.type === 'PURCHASE_CAPTURE';
          try {
            const result = purchase ? await confirmPurchase(payment.reservation_id, payment.buyer_id, payment.provider_order_id)
              : await confirmCommitment(payment.reservation_id, payment.buyer_id, payment.provider_order_id);
            await resumeAgentAfterPayment(payment.reservation_id, payment.buyer_id, result, purchase);
          } catch (error) {
            if (!['CLAIM_EXPIRED','CLAIM_ENDED','PAYMENT_UNRESOLVED'].includes(error.code)) throw error;
            if (!purchase && e.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
              const capture = await getCapture(resource.id);
              await client.query(`UPDATE payment_transactions SET provider_capture_id=$2,amount=$3,currency=$4,status='CAPTURE_RECONCILE' WHERE id=$1`,
                [payment.id,capture.id,capture.amount.value,capture.amount.currency_code]);
              await client.query(`UPDATE reservations SET status='FAILED',ended_at=now() WHERE id=$1 AND activated_at IS NULL`, [payment.reservation_id]);
              // Commit the identifiers first; the sweep settles this recoverably.
            }
          }
        } else if (payment && e.event_type === 'PAYMENT.AUTHORIZATION.VOIDED') {
          if ((await getAuthorization(resource.id)).status !== 'VOIDED') throw new Error('Authorization void is not confirmed.');
          await client.query(`UPDATE payment_transactions SET status='VOIDED' WHERE id=$1`, [payment.id]);
          await client.query(`UPDATE reservations SET status='FAILED',ended_at=now() WHERE id=$1 AND status='RESERVED'`, [payment.reservation_id]);
        } else if (payment && e.event_type === 'PAYMENT.CAPTURE.REFUNDED') {
          const refund = await getRefund(resource.id);
          if (refund.status === 'COMPLETED' && payment.provider_refund_id === refund.id) {
            await client.query(`UPDATE payment_transactions SET status='REFUNDED' WHERE id=$1`, [payment.id]);
          }
        }
        await client.query(`UPDATE paypal_webhook_events SET status='PROCESSED', attempts=attempts+1,last_error=NULL WHERE id=$1`, [item.id]);
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT webhook_event');
        await client.query(`UPDATE paypal_webhook_events SET status='FAILED',attempts=attempts+1,last_error=$2 WHERE id=$1`, [item.id,error.message]);
      }
      await client.query('RELEASE SAVEPOINT webhook_event');
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
