import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { requestApprovalClaim, releaseClaim, ReservationError } from './src/core/reservations/claims.ts';
import { startCommitment, confirmCommitment, voidOutstanding, verifyCallback } from './src/core/reservations/commitment.mjs';
import { runExpirationSweep } from './src/core/reservations/sweep.mjs';
import { currentPolicy, createPolicy } from './src/core/policies/config.mjs';
import { startPurchase, confirmPurchase } from './src/core/reservations/purchase.mjs';
import { createAgentRun, processAgentRun, getAgentRun, resumeAgentAfterPayment } from './src/agents/shopper.mjs';
import { merchantSession, createDemoSession } from './src/lib/session.mjs';
import { receiveWebhook } from './src/integrations/paypal/webhooks.mjs';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
const merchantId = 'merchant-001';
const identities = [
  { key: process.env.DEMO_AGENT_A_KEY, buyerId: 'buyer-a', agentId: 'agent-a' },
  { key: process.env.DEMO_AGENT_B_KEY, buyerId: 'buyer-b', agentId: 'agent-b' },
].filter((entry) => entry.key && !entry.key.startsWith('replace-'));

function identity(request) {
  if (merchantSession(request)) {
    const persona = request.headers['x-demo-buyer'];
    return persona === 'a' ? identities.find(x => x.buyerId === 'buyer-a') : persona === 'b' ? identities.find(x => x.buyerId === 'buyer-b') : null;
  }
  const bearer = request.headers.authorization?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!bearer) return null;
  const hash = createHash('sha256').update(bearer).digest();
  return identities.find((entry) => timingSafeEqual(hash, createHash('sha256').update(entry.key).digest())) ?? null;
}

function merchantAuthorized(request) {
  if (merchantSession(request)) return true;
  const key = request.headers.authorization?.match(/^Bearer ([^\s]+)$/)?.[1];
  const expected = process.env.MERCHANT_API_KEY;
  return Boolean(key && expected && !expected.startsWith('replace-') && timingSafeEqual(
    createHash('sha256').update(key).digest(), createHash('sha256').update(expected).digest()));
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
    if (!['GET','HEAD'].includes(request.method) && request.headers.origin) {
      const allowed = new URL(process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`).origin;
      if (request.headers.origin !== allowed) return send(response, 403, { error: 'INVALID_ORIGIN' });
    }
    const staticFiles = { '/': ['index.html','text/html'], '/demo': ['index.html','text/html'],
      '/app.js': ['app.js','text/javascript'], '/styles.css': ['styles.css','text/css'] };
    if (request.method === 'GET' && staticFiles[url.pathname]) {
      const [file, mime] = staticFiles[url.pathname];
      response.writeHead(200, { 'content-type': `${mime}; charset=utf-8`, 'cache-control': 'no-store',
        'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin' });
      response.end(await readFile(new URL(`./public/${file}`, import.meta.url)));
      return;
    }
    if (url.pathname === '/api/demo/session') {
      if (request.method === 'POST') {
        const body = await readBody(request);
        if (typeof body.key !== 'string' || !merchantAuthorized({ headers: { authorization: `Bearer ${body.key}` } })) {
          return send(response, 401, { error: 'INVALID_MERCHANT_KEY' });
        }
        response.setHeader('set-cookie', `resaf_session=${createDemoSession()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${process.env.RENDER_EXTERNAL_URL ? '; Secure' : ''}`);
        return send(response, 200, { signed_in: true });
      }
      if (request.method === 'DELETE') {
        response.setHeader('set-cookie', 'resaf_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
        return send(response, 200, { signed_in: false });
      }
    }
    if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, { ok: true });
    if (request.method === 'POST' && url.pathname === '/api/webhooks/paypal') {
      const accepted = await receiveWebhook(request.headers, await readBody(request));
      return send(response, accepted ? 200 : 401, { accepted });
    }
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
            const purchase = url.searchParams.get('action') === 'purchase';
            const result = purchase ? await confirmPurchase(id, buyerId, orderId) : await confirmCommitment(id, buyerId, orderId);
            await resumeAgentAfterPayment(id, buyerId, result, purchase);
            heading = purchase ? 'Purchase confirmed' : 'Reservation active';
            message = purchase ? 'PayPal purchase verified. Inventory is sold; the commitment is being settled under your accepted terms.' : `PayPal commitment verified. Reservation expires at ${new Date(result.expires_at).toUTCString()}.`;
          } catch (error) {
            status = error instanceof ReservationError ? 409 : 502;
            heading = 'Reservation not activated';
            message = 'PayPal approval could not be confirmed in time. Check the reservation status before trying again.';
            console.error('PayPal return confirmation failed:', error);
          }
        }
      }
      response.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end(`<html><title>Resaf Sandbox</title><body style="font:18px system-ui;max-width:38rem;margin:5rem auto"><h1>${heading}</h1><p>${message}</p><a href="/demo">Return to the Resaf demo</a></body></html>`);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/resources') {
      const result = await pool.query(`SELECT id,title,description,price,currency,quantity,status FROM resources WHERE merchant_id = $1`, [merchantId]);
      return send(response, 200, { resources: result.rows });
    }
    const policyMatch = url.pathname.match(/^\/api\/v1\/resources\/([a-zA-Z0-9-]+)\/policy$/);
    if (policyMatch && request.method === 'GET') {
      const policy = await currentPolicy(merchantId, policyMatch[1]);
      return send(response, policy ? 200 : 404, policy ?? { error: 'POLICY_NOT_FOUND' });
    }
    if (policyMatch && request.method === 'POST') {
      if (!merchantAuthorized(request)) return send(response, 401, { error: 'UNAUTHORIZED' });
      const key = request.headers['idempotency-key'];
      if (typeof key !== 'string' || key.length < 8 || key.length > 128) {
        return send(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' });
      }
      const policy = await createPolicy(merchantId, policyMatch[1], await readBody(request), key);
      return send(response, 201, policy);
    }

    const resourceMatch = url.pathname.match(/^\/api\/v1\/resources\/([a-zA-Z0-9-]+)$/);
    if (request.method === 'GET' && resourceMatch) {
      const { rows } = await pool.query(`SELECT i.id, i.title, i.description, i.price, i.currency, i.quantity,
        CASE WHEN i.status = 'SOLD' THEN 'SOLD'
          WHEN r.status = 'RESERVED' THEN 'RESERVED'
          WHEN r.status = 'PENDING_COMMITMENT' THEN 'APPROVAL_PENDING'
          WHEN r.status = 'PURCHASE_PENDING' THEN 'PURCHASE_PENDING'
          ELSE i.status END AS status,
        CASE WHEN r.status = 'RESERVED' THEN r.expires_at WHEN r.status = 'PURCHASE_PENDING' THEN r.purchase_expires_at ELSE r.claim_expires_at END AS available_at
        FROM resources i LEFT JOIN LATERAL (
          SELECT status, expires_at, claim_expires_at, purchase_expires_at FROM reservations
          WHERE resource_id = i.id AND
            ((status = 'RESERVED' AND expires_at > now()) OR
             (status = 'PENDING_COMMITMENT' AND claim_expires_at > now()) OR
             (status = 'PURCHASE_PENDING' AND purchase_expires_at > now())) LIMIT 1
        ) r ON true WHERE i.id = $1 AND i.merchant_id = $2`, [resourceMatch[1], merchantId]);
      return send(response, rows.length ? 200 : 404, rows[0] ?? { error: 'RESOURCE_NOT_FOUND' });
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/merchant/activity') {
      if (!merchantAuthorized(request)) return send(response, 401, { error: 'UNAUTHORIZED' });
      const [events, runs, policies, payments] = await Promise.all([
        pool.query(`SELECT e.*, r.buyer_id, r.commitment_amount, r.policy_version FROM reservation_events e
          JOIN reservations r ON r.id = e.reservation_id JOIN resources i ON i.id = r.resource_id
          WHERE i.merchant_id = $1 ORDER BY e.occurred_at DESC LIMIT 200`, [merchantId]),
        pool.query(`SELECT * FROM agent_runs WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 20`, [merchantId]),
        pool.query(`SELECT * FROM reservation_policies WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 50`, [merchantId]),
        pool.query(`SELECT t.* FROM payment_transactions t JOIN reservations r ON r.id = t.reservation_id
          JOIN resources i ON i.id = r.resource_id WHERE i.merchant_id = $1 ORDER BY t.created_at DESC LIMIT 300`, [merchantId]),
      ]);
      const decisions = events.rows.map(e => ({ id: e.id, occurred_at: e.occurred_at,
        actor: e.buyer_id === 'buyer-a' ? 'Agent A' : 'Agent B', category: /PAYPAL|AUTHORIZATION|CAPTURE|COMMITMENT_SETTLED/.test(e.event_type) ? 'PAYPAL' : 'RESERVATION',
        action: e.event_type, amount: e.commitment_amount, policy_version: e.policy_version,
        outcome: e.event_type, evidence: { event: e, payments: payments.rows.filter(p => p.reservation_id === e.reservation_id) } }));
      for (const r of runs.rows) for (const [n, step] of r.steps.entries()) decisions.push({ id: `${r.id}:${n}`,
        occurred_at: step.occurred_at, actor: r.buyer_id === 'buyer-a' ? 'Agent A' : 'Agent B', category: 'AGENT',
        action: step.tool, amount: step.result?.commitment?.amount, policy_version: step.result?.policy_version,
        outcome: step.result?.error || step.result?.status || `HTTP ${step.result?.http_status || 'TOOL'}`, evidence: step });
      for (const p of policies.rows) decisions.push({ id: `policy:${p.id}`, occurred_at: p.created_at,
        actor: p.change_source === 'automation' ? 'Business rules' : 'Merchant', category: 'POLICY',
        action: p.change_source === 'automation' ? 'AUTOMATIC_PRICE_ADJUSTMENT' : 'POLICY_PUBLISHED', amount: p.commitment_amount,
        policy_version: p.version, outcome: `Effective ${new Date(p.effective_at).toISOString()}`, evidence: p });
      decisions.sort((a,b) => new Date(a.occurred_at) - new Date(b.occurred_at));
      return send(response, 200, { decisions, runs: runs.rows });
    }
    const actor = identity(request);
    if (!actor) return send(response, 401, { error: 'UNAUTHORIZED' });

    if (request.method === 'POST' && url.pathname === '/api/v1/agents/runs') {
      const body = await readBody(request);
      const key = request.headers['idempotency-key'];
      if (typeof key !== 'string' || key.length < 8 || key.length > 128) return send(response, 400, { error: 'IDEMPOTENCY_KEY_REQUIRED' });
      const run = await createAgentRun(actor, body.objective, key);
      void processAgentRun(run.id).catch(error => console.error('Agent processing failed:', error.message));
      return send(response, 202, run);
    }
    const runMatch = url.pathname.match(/^\/api\/v1\/agents\/runs\/([0-9a-f-]{36})$/i);
    if (request.method === 'GET' && runMatch) {
      const run = await getAgentRun(runMatch[1], actor.buyerId);
      return send(response, run ? 200 : 404, run ?? { error: 'NOT_FOUND' });
    }

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
      const policy = await pool.query(`SELECT payment_mode, purchase_refund_bps, release_refund_bps,
        expiry_refund_bps, hold_duration_seconds FROM reservation_policies WHERE id = $1`, [claim.policy_id]);
      return send(response, 201, {
        reservation_id: claim.id, status: claim.status, claim_expires_at: claim.claim_expires_at,
        commitment: { amount: claim.commitment_amount, currency: claim.currency },
        policy_version: claim.policy_version,
        terms: policy.rows[0],
      });
    }

    const reservationMatch = url.pathname.match(/^\/api\/v1\/reservations\/([0-9a-f-]{36})(?:\/(events|release|commitment|confirm|purchase|confirm-purchase))?$/i);
    if (reservationMatch) {
      const id = reservationMatch[1];
      const action = reservationMatch[2];
      if (request.method === 'POST' && action === 'purchase') {
        const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_BASE_URL || 'http://localhost:3000';
        return send(response, 200, await startPurchase(id, actor.buyerId, baseUrl));
      }
      if (request.method === 'POST' && action === 'confirm-purchase') {
        return send(response, 200, await confirmPurchase(id, actor.buyerId));
      }
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
        catch { paymentStatus = 'SETTLEMENT_PENDING'; }
        if (['RELEASED','EXPIRED'].includes(claim.status)) await pool.query(`UPDATE agent_runs SET status='COMPLETED',
          result=$3, updated_at=now() WHERE buyer_id=$1 AND result->>'reservation_id'=$2 AND status='AWAITING_APPROVAL'`,
          [actor.buyerId,id,JSON.stringify({ reservation_id:id,status:claim.status,payment_status:paymentStatus })]);
        return send(response, ['SETTLEMENT_PENDING', 'REFUND_PENDING', 'CAPTURE_PENDING'].includes(paymentStatus) ? 202 : 200,
          { reservation_id: claim.id, status: claim.status, payment_status: paymentStatus });
      }
      const owned = await pool.query(`SELECT r.* FROM reservations r JOIN resources i ON i.id = r.resource_id
        WHERE r.id = $1 AND r.buyer_id = $2 AND i.merchant_id = $3`, [id, actor.buyerId, merchantId]);
      if (!owned.rowCount) return send(response, 404, { error: 'NOT_FOUND' });
      if (request.method === 'GET' && !action) {
        const payments = await pool.query(`SELECT type, status, amount, currency, provider_order_id,
          provider_authorization_id, provider_capture_id, provider_refund_id FROM payment_transactions
          WHERE reservation_id = $1 ORDER BY created_at, id`, [id]);
        return send(response, 200, { ...owned.rows[0], payments: payments.rows });
      }
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
      const status = ['NOT_FOUND', 'RESOURCE_NOT_FOUND', 'POLICY_NOT_FOUND'].includes(error.code) ? 404 : conflict.includes(error.code) ? 409 : 400;
      return send(response, status, { error: error.code, message: error.message });
    }
    console.error(error);
    send(response, 500, { error: 'INTERNAL_ERROR' });
  }
});

server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => {
  console.log(`Resaf API listening on ${process.env.PORT || 3000}`);
});
