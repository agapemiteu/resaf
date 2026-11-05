import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import pg from 'pg';
import { requestApprovalClaim, releaseClaim, ReservationError } from './src/core/reservations/claims.ts';
import { startCommitment, confirmCommitment, voidOutstanding, verifyCallback } from './src/core/reservations/commitment.mjs';
import { runExpirationSweep } from './src/core/reservations/sweep.mjs';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const merchantId = 'merchant-001';
const identities = [
  { key: process.env.DEMO_AGENT_A_KEY, buyerId: 'buyer-a', agentId: 'agent-a' },
  { key: process.env.DEMO_AGENT_B_KEY, buyerId: 'buyer-b', agentId: 'agent-b' },
].filter((entry) => entry.key && !entry.key.startsWith('replace-'));

function identity(request) {
  const bearer = request.headers.authorization?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!bearer) return null;
  const hash = createHash('sha256').update(bearer).digest();
  return identities.find((entry) => timingSafeEqual(hash, createHash('sha256').update(entry.key).digest())) ?? null;
}

function send(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  let input = '';
  for await (const chunk of request) {
    input += chunk;
    if (input.length > 16384) throw new ReservationError('TOO_LARGE', 'Request body is too large.');
  }
  try { return JSON.parse(input || '{}'); }
  catch { throw new ReservationError('INVALID_JSON', 'Request body must be JSON.'); }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, { ok: true });
    if (['GET', 'POST'].includes(request.method) && url.pathname === '/internal/expire') {
      const bearer = request.headers.authorization?.match(/^Bearer ([^\s]+)$/)?.[1];
      const secret = process.env.CRON_SECRET;
      if (!bearer || !secret || secret.startsWith('replace-') ||
          !timingSafeEqual(createHash('sha256').update(bearer).digest(),
            createHash('sha256').update(secret).digest())) {
        return send(response, 401, { error: 'UNAUTHORIZED' });
      }
      if (request.method === 'GET') {
        const result = await pool.query(`SELECT completed_at, source, result FROM maintenance_status WHERE name = 'expiration'`);
        return send(response, 200, result.rows[0] ?? { status: 'NEVER_RUN' });
      }
      const result = await runExpirationSweep();
      await pool.query(`INSERT INTO maintenance_status (name, completed_at, source, result)
        VALUES ('expiration', now(), $1, $2) ON CONFLICT (name) DO UPDATE
        SET completed_at = excluded.completed_at, source = excluded.source, result = excluded.result`,
        [request.headers['x-resaf-scheduler'] === 'cloudflare' ? 'cloudflare' : 'manual', JSON.stringify(result)]);
      return send(response, result.failed ? 503 : 200, result);
    }
    if (request.method === 'GET' && (url.pathname === '/paypal/return' || url.pathname === '/paypal/cancel')) {
      const approved = url.pathname === '/paypal/return';
      let status = 200;
      let heading = approved ? 'Returned from PayPal' : 'PayPal checkout canceled';
      let message = approved ? 'Approval and authorization are not yet verified.' : 'No reservation was activated.';
      if (approved && url.searchParams.has('reservation_id')) {
        const id = url.searchParams.get('reservation_id');
        const buyerId = url.searchParams.get('buyer_id');
        const signature = url.searchParams.get('sig');
        const orderId = url.searchParams.get('token');
        if (!/^[0-9a-f-]{36}$/i.test(id ?? '') || !/^buyer-[ab]$/.test(buyerId ?? '') ||
            !verifyCallback(id, buyerId, signature) || !orderId) {
          status = 400;
          heading = 'Invalid PayPal return';
          message = 'The reservation was not activated.';
        } else {
          try {
            const result = await confirmCommitment(id, buyerId, orderId);
            heading = 'Reservation active';
            message = `PayPal authorization verified. Reservation expires at ${new Date(result.expires_at).toUTCString()}.`;
          } catch (error) {
            status = error instanceof ReservationError ? 409 : 502;
            heading = 'Reservation not activated';
            message = 'PayPal approval could not be confirmed in time. Check the reservation status before trying again.';
            console.error('PayPal return confirmation failed:', error);
          }
        }
      }
      response.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end(`<html><title>Resaf Sandbox</title><body style="font:18px system-ui;max-width:38rem;margin:5rem auto"><h1>${heading}</h1><p>${message}</p></body></html>`);
      return;
    }

    const resourceMatch = url.pathname.match(/^\/api\/v1\/resources\/([a-zA-Z0-9-]+)$/);
    if (request.method === 'GET' && resourceMatch) {
      const { rows } = await pool.query(`SELECT i.id, i.title, i.description, i.price, i.currency, i.quantity,
        CASE WHEN i.status = 'SOLD' THEN 'SOLD'
          WHEN r.status = 'RESERVED' THEN 'RESERVED'
          WHEN r.status = 'PENDING_COMMITMENT' THEN 'APPROVAL_PENDING'
          ELSE i.status END AS status,
        CASE WHEN r.status = 'RESERVED' THEN r.expires_at ELSE r.claim_expires_at END AS available_at
        FROM resources i LEFT JOIN LATERAL (
          SELECT status, expires_at, claim_expires_at FROM reservations
          WHERE resource_id = i.id AND
            ((status = 'RESERVED' AND expires_at > now()) OR
             (status = 'PENDING_COMMITMENT' AND claim_expires_at > now())) LIMIT 1
        ) r ON true WHERE i.id = $1 AND i.merchant_id = $2`, [resourceMatch[1], merchantId]);
      return send(response, rows.length ? 200 : 404, rows[0] ?? { error: 'RESOURCE_NOT_FOUND' });
    }

    const actor = identity(request);
    if (!actor) return send(response, 401, { error: 'UNAUTHORIZED' });

    if (request.method === 'POST' && url.pathname === '/api/v1/reservations') {
      const body = await readBody(request);
      const key = request.headers['idempotency-key'];
      if (typeof key !== 'string' || key.length < 8 || key.length > 128) {
        return send(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' });
      }
      if (typeof body.resource_id !== 'string') return send(response, 400, { error: 'RESOURCE_ID_REQUIRED' });
      const claim = await requestApprovalClaim({
        merchantId, resourceId: body.resource_id, buyerId: actor.buyerId,
        agentId: actor.agentId, idempotencyKey: key,
      });
      return send(response, 201, {
        reservation_id: claim.id, status: claim.status, claim_expires_at: claim.claim_expires_at,
        commitment: { amount: claim.commitment_amount, currency: claim.currency },
        policy_version: claim.policy_version,
      });
    }

    const reservationMatch = url.pathname.match(/^\/api\/v1\/reservations\/([0-9a-f-]{36})(?:\/(events|release|commitment|confirm))?$/i);
    if (reservationMatch) {
      const id = reservationMatch[1];
      const action = reservationMatch[2];
      if (request.method === 'POST' && action === 'commitment') {
        const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_BASE_URL || 'http://localhost:3000';
        const result = await startCommitment(id, actor.buyerId, baseUrl);
        return send(response, 200, result);
      }
      if (request.method === 'POST' && action === 'confirm') {
        const result = await confirmCommitment(id, actor.buyerId);
        return send(response, 200, result);
      }
      if (request.method === 'POST' && action === 'release') {
        const claim = await releaseClaim(merchantId, actor.buyerId, id);
        let paymentStatus = null;
        try { paymentStatus = await voidOutstanding(id); }
        catch { paymentStatus = 'VOID_PENDING'; }
        return send(response, paymentStatus === 'VOID_PENDING' ? 202 : 200,
          { reservation_id: claim.id, status: claim.status, payment_status: paymentStatus });
      }
      const owned = await pool.query(`SELECT r.* FROM reservations r JOIN resources i ON i.id = r.resource_id
        WHERE r.id = $1 AND r.buyer_id = $2 AND i.merchant_id = $3`, [id, actor.buyerId, merchantId]);
      if (!owned.rowCount) return send(response, 404, { error: 'NOT_FOUND' });
      if (request.method === 'GET' && !action) return send(response, 200, owned.rows[0]);
      if (request.method === 'GET' && action === 'events') {
        const events = await pool.query(`SELECT event_type, event_payload, occurred_at FROM reservation_events
          WHERE reservation_id = $1 ORDER BY occurred_at, id`, [id]);
        return send(response, 200, { reservation_id: id, events: events.rows });
      }
    }
    send(response, 404, { error: 'NOT_FOUND' });
  } catch (error) {
    if (error instanceof ReservationError) {
      const conflict = ['SOLD', 'UNAVAILABLE', 'BUYER_LIMIT', 'COOLDOWN', 'IDEMPOTENCY_CONFLICT',
        'CLAIM_EXPIRED', 'CLAIM_ENDED', 'APPROVAL_REQUIRED'];
      return send(response, conflict.includes(error.code) ? 409 : 400, { error: error.code, message: error.message });
    }
    console.error(error);
    send(response, 500, { error: 'INTERNAL_ERROR' });
  }
});

server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => {
  console.log(`Resaf API listening on ${process.env.PORT || 3000}`);
});
