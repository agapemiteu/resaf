import pg from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { ReservationError } from '../reservations/claims.ts';
import { validateAutomation, moneyCents } from './automation.mjs';
import { recommendCommitment } from '../../agents/business.mjs';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const fields = ['commitment_amount', 'currency', 'payment_mode', 'hold_duration_seconds',
  'approval_claim_seconds', 'max_active_holds_per_buyer', 'repeat_cooldown_seconds',
  'purchase_refund_bps', 'release_refund_bps', 'expiry_refund_bps', 'effective_at', 'automation'];

export function validatePolicy(body) {
  const invalid = (message) => { throw new ReservationError('INVALID_POLICY', message); };
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('Policy must be an object.');
  for (const key of Object.keys(body)) if (!fields.includes(key)) invalid(`Unknown policy field: ${key}`);
  if (typeof body.commitment_amount !== 'string' || !/^\d{1,8}\.\d{2}$/.test(body.commitment_amount) ||
      Number(body.commitment_amount) <= 0) invalid('commitment_amount must be a positive decimal string with two places.');
  if (body.currency !== 'USD') invalid('This Sandbox integration supports USD.');
  if (!['AUTHORIZE', 'CAPTURE'].includes(body.payment_mode)) invalid('payment_mode must be AUTHORIZE or CAPTURE.');
  const policy = { commitment_amount: Number(body.commitment_amount).toFixed(2), currency: body.currency,
    payment_mode: body.payment_mode };
  const ranges = {
    hold_duration_seconds: [1, 86400], approval_claim_seconds: [30, 300],
    max_active_holds_per_buyer: [1, 10], repeat_cooldown_seconds: [0, 604800],
    purchase_refund_bps: [0, 10000], release_refund_bps: [0, 10000], expiry_refund_bps: [0, 10000],
  };
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (!Number.isInteger(body[key]) || body[key] < min || body[key] > max) invalid(`${key} must be an integer from ${min} to ${max}.`);
    policy[key] = body[key];
  }
  if (policy.payment_mode === 'AUTHORIZE' && [policy.purchase_refund_bps, policy.release_refund_bps, policy.expiry_refund_bps].some((n) => n !== 10000)) {
    invalid('AUTHORIZE mode releases the full authorization; retained fees require CAPTURE mode.');
  }
  if (body.effective_at !== undefined && (typeof body.effective_at !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(body.effective_at) ||
      !Number.isFinite(Date.parse(body.effective_at)))) invalid('effective_at must be a timestamp with a timezone.');
  policy.effective_at = body.effective_at ? new Date(body.effective_at).toISOString() : null;
  try { policy.automation = validateAutomation(body.automation); }
  catch (error) { invalid(error.message); }
  if (policy.automation && (moneyCents(policy.commitment_amount) < moneyCents(policy.automation.min_amount) ||
      moneyCents(policy.commitment_amount) > moneyCents(policy.automation.max_amount))) invalid('Commitment must be inside automation bounds.');
  return policy;
}

export async function currentPolicy(merchantId, resourceId) {
  const result = await pool.query(`SELECT * FROM reservation_policies WHERE merchant_id = $1
    AND resource_id = $2 AND effective_at <= now() ORDER BY effective_at DESC, version DESC LIMIT 1`, [merchantId, resourceId]);
  return result.rows[0] ? { ...result.rows[0], approval_retry_cooldown_seconds: 60 } : null;
}

export async function createPolicy(merchantId, resourceId, body, requestKey, expectedPolicyId) {
  const policy = validatePolicy(body);
  const hash = createHash('sha256').update(JSON.stringify(policy)).digest('hex');
  const key = `policy:${resourceId}:${requestKey}`;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resource = await client.query(`SELECT currency FROM resources WHERE id = $1 AND merchant_id = $2 FOR UPDATE`, [resourceId, merchantId]);
    if (!resource.rowCount) throw new ReservationError('RESOURCE_NOT_FOUND', 'Resource does not belong to this merchant.');
    if (resource.rows[0].currency !== policy.currency) throw new ReservationError('INVALID_POLICY', 'Policy currency must match the resource.');
    if (expectedPolicyId) {
      const current = await client.query(`SELECT id FROM reservation_policies WHERE resource_id = $1
        AND effective_at <= now() ORDER BY effective_at DESC, version DESC LIMIT 1`, [resourceId]);
      if (current.rows[0]?.id !== expectedPolicyId) throw new ReservationError('POLICY_CHANGED', 'Policy changed during evaluation.');
    }
    const previous = await client.query(`SELECT * FROM idempotency_records WHERE merchant_id = $1 AND request_key = $2`, [merchantId, key]);
    if (previous.rowCount) {
      if (previous.rows[0].request_hash !== hash) throw new ReservationError('IDEMPOTENCY_CONFLICT', 'Key was already used with different policy terms.');
      const replay = await client.query(`SELECT * FROM reservation_policies WHERE id = $1`, [previous.rows[0].response_reference]);
      await client.query('COMMIT');
      return replay.rows[0];
    }
    const version = await client.query(`SELECT COALESCE(MAX(version), 0) + 1 AS version FROM reservation_policies WHERE resource_id = $1`, [resourceId]);
    const result = await client.query(`INSERT INTO reservation_policies
      (id, merchant_id, resource_id, version, commitment_amount, currency, payment_mode,
       hold_duration_seconds, approval_claim_seconds, max_active_holds_per_buyer, repeat_cooldown_seconds,
       purchase_refund_bps, release_refund_bps, expiry_refund_bps, effective_at, automation, change_source)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,COALESCE($15::timestamptz,now()),$16,$17) RETURNING *`,
      [randomUUID(), merchantId, resourceId, version.rows[0].version, policy.commitment_amount, policy.currency,
        policy.payment_mode, policy.hold_duration_seconds, policy.approval_claim_seconds, policy.max_active_holds_per_buyer,
        policy.repeat_cooldown_seconds, policy.purchase_refund_bps, policy.release_refund_bps, policy.expiry_refund_bps,
        policy.effective_at, policy.automation ? JSON.stringify(policy.automation) : null, expectedPolicyId ? 'automation' : 'merchant']);
    await client.query(`INSERT INTO idempotency_records (merchant_id, request_key, request_hash, response_reference)
      VALUES ($1,$2,$3,$4)`, [merchantId, key, hash, result.rows[0].id]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function evaluatePolicies() {
  const policies = await pool.query(`SELECT * FROM (SELECT DISTINCT ON (p.resource_id) p.*
    FROM reservation_policies p JOIN resources r ON r.id = p.resource_id
    WHERE p.effective_at <= now() AND r.status <> 'SOLD'
    ORDER BY p.resource_id, p.effective_at DESC, p.version DESC) current
    WHERE automation IS NOT NULL AND created_at <= now() - ((automation->>'cooldown_seconds')::int * interval '1 second') LIMIT 3`);
  let changed = 0;
  for (const policy of policies.rows) {
    const demand = await pool.query(`SELECT count(*) FILTER (WHERE activated_at IS NOT NULL)::int AS paid_holds,
      count(*) FILTER (WHERE activated_at IS NULL)::int AS unpaid_attempts,
      count(*) FILTER (WHERE status = 'PURCHASED')::int AS purchases FROM reservations
      WHERE resource_id = $1 AND requested_at >= now() - ($2::int * interval '1 second')`,
      [policy.resource_id, policy.automation.window_seconds]);
    const key = `${policy.id}:${Math.floor(Date.now() / (policy.automation.cooldown_seconds * 1000))}`;
    const evaluation = await pool.query(`INSERT INTO business_agent_decisions (merchant_id,resource_id,policy_id,evaluation_key,signals)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id`,
      [policy.merchant_id,policy.resource_id,policy.id,key,JSON.stringify(demand.rows[0])]);
    if (!evaluation.rowCount) continue;
    try {
      const decision = await recommendCommitment(policy, demand.rows[0]);
      if (decision.amount !== policy.commitment_amount) {
        const input = Object.fromEntries(fields.filter(k => k !== 'effective_at').map(k => [k, policy[k]]));
        input.commitment_amount = decision.amount;
        await createPolicy(policy.merchant_id,policy.resource_id,input,`auto:${policy.id}`,policy.id);
        changed++;
      }
      await pool.query(`UPDATE business_agent_decisions SET status='COMPLETED',decision=$2 WHERE id=$1`,[evaluation.rows[0].id,JSON.stringify(decision)]);
    } catch (error) {
      await pool.query(`UPDATE business_agent_decisions SET status='FAILED',decision=$2 WHERE id=$1`,[evaluation.rows[0].id,JSON.stringify({error:error.message})]);
      // A model outage leaves the previous price intact and must not stop expiration.
    }
  }
  return changed;
}
