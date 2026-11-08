import { createHash } from 'node:crypto';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

export class ReservationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

type ClaimRequest = {
  merchantId: string;
  resourceId: string;
  buyerId: string; // Resolved from the authenticated merchant session, never a free client claim.
  agentId: string;
  idempotencyKey: string;
};

async function inTransaction<T>(
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function expireForResource(client: pg.PoolClient, resourceId: string) {
  const expired = await client.query(
    `
    UPDATE reservations SET status = 'EXPIRED', ended_at = now()
    WHERE resource_id = $1 AND status IN ('PENDING_COMMITMENT', 'RESERVED', 'PURCHASE_PENDING')
      AND ((status = 'PENDING_COMMITMENT' AND claim_expires_at <= now())
        OR (status = 'RESERVED' AND expires_at <= now())
        OR (status = 'PURCHASE_PENDING' AND purchase_expires_at <= now()))
    RETURNING id, status`,
    [resourceId],
  );
  for (const row of expired.rows) {
    await client.query(
      `INSERT INTO reservation_events (reservation_id, event_type)
      VALUES ($1, 'RESERVATION_EXPIRED')`,
      [row.id],
    );
    // Financial cleanup runs separately from inventory expiration.
  }
}

export async function requestApprovalClaim(input: ClaimRequest) {
  if (
    !input.merchantId ||
    !input.resourceId ||
    !input.buyerId ||
    !input.agentId ||
    !input.idempotencyKey
  ) {
    throw new ReservationError(
      'INVALID_REQUEST',
      'All claim fields are required.',
    );
  }
  const requestHash = createHash('sha256')
    .update(
      JSON.stringify([
        input.merchantId,
        input.resourceId,
        input.buyerId,
        input.agentId,
      ]),
    )
    .digest('hex');

  return inTransaction(async (client) => {
    // This row lock serializes requests for the same one-unit resource.
    const resourceResult = await client.query(
      `SELECT id, status, quantity FROM resources
      WHERE id = $1 AND merchant_id = $2 FOR UPDATE`,
      [input.resourceId, input.merchantId],
    );
    const resource = resourceResult.rows[0];
    if (!resource)
      throw new ReservationError(
        'RESOURCE_NOT_FOUND',
        'Resource does not belong to this merchant.',
      );
    if (resource.status === 'SOLD')
      throw new ReservationError('SOLD', 'Resource has been sold.');
    if (resource.quantity !== 1)
      throw new ReservationError(
        'UNSUPPORTED_CAPACITY',
        'Resources must have a quantity of one.',
      );

    const buyer = await client.query(
      `SELECT id FROM buyers WHERE id = $1 AND merchant_id = $2`,
      [input.buyerId, input.merchantId],
    );
    if (!buyer.rowCount)
      throw new ReservationError(
        'BUYER_NOT_FOUND',
        'Buyer is not registered with this merchant.',
      );

    const existing = await client.query(
      `SELECT request_hash, response_reference FROM idempotency_records
      WHERE merchant_id = $1 AND request_key = $2`,
      [input.merchantId, input.idempotencyKey],
    );
    if (existing.rowCount) {
      if (existing.rows[0].request_hash !== requestHash) {
        throw new ReservationError(
          'IDEMPOTENCY_CONFLICT',
          'This key was used for a different request.',
        );
      }
      const replay = await client.query(
        `SELECT * FROM reservations WHERE id = $1`,
        [existing.rows[0].response_reference],
      );
      return replay.rows[0];
    }

    await expireForResource(client, input.resourceId);

    const policyResult = await client.query(
      `SELECT * FROM reservation_policies
      WHERE resource_id = $1 AND merchant_id = $2 AND effective_at <= now()
      ORDER BY effective_at DESC, version DESC LIMIT 1`,
      [input.resourceId, input.merchantId],
    );
    const policy = policyResult.rows[0];
    if (!policy)
      throw new ReservationError(
        'POLICY_NOT_FOUND',
        'Resource has no reservation policy.',
      );

    const conflict = await client.query(
      `SELECT id FROM reservations WHERE resource_id = $1
      AND status IN ('PENDING_COMMITMENT', 'RESERVED', 'PURCHASE_PENDING') LIMIT 1`,
      [input.resourceId],
    );
    if (conflict.rowCount)
      throw new ReservationError(
        'UNAVAILABLE',
        'Resource is temporarily unavailable.',
      );

    const activeCount = await client.query(
      `SELECT count(*)::integer AS count FROM reservations
      WHERE buyer_id = $1 AND status IN ('PENDING_COMMITMENT', 'RESERVED', 'PURCHASE_PENDING')`,
      [input.buyerId],
    );
    if (activeCount.rows[0].count >= policy.max_active_holds_per_buyer) {
      throw new ReservationError(
        'BUYER_LIMIT',
        'Buyer has reached the active claim limit.',
      );
    }

    const cooldown = await client.query(
      `SELECT id FROM reservations WHERE resource_id = $1 AND buyer_id = $2
      AND status IN ('EXPIRED', 'RELEASED')
      AND ended_at > now() - ((CASE WHEN activated_at IS NULL THEN 60 ELSE $3::integer END) * interval '1 second') LIMIT 1`,
      [input.resourceId, input.buyerId, policy.repeat_cooldown_seconds],
    );
    if (cooldown.rowCount)
      throw new ReservationError(
        'COOLDOWN',
        'Buyer must wait before claiming this resource again.',
      );

    const created = await client.query(
      `INSERT INTO reservations
      (resource_id, buyer_id, agent_id, policy_id, policy_version, status,
       commitment_amount, currency, claim_expires_at)
      VALUES ($1, $2, $3, $4, $5, 'PENDING_COMMITMENT', $6, $7,
        now() + ($8::integer * interval '1 second')) RETURNING *`,
      [
        input.resourceId,
        input.buyerId,
        input.agentId,
        policy.id,
        policy.version,
        policy.commitment_amount,
        policy.currency,
        policy.approval_claim_seconds,
      ],
    );
    const reservation = created.rows[0];
    await client.query(
      `INSERT INTO reservation_events (reservation_id, event_type)
      VALUES ($1, 'APPROVAL_CLAIM_CREATED')`,
      [reservation.id],
    );
    await client.query(
      `INSERT INTO idempotency_records
      (merchant_id, request_key, request_hash, response_reference) VALUES ($1, $2, $3, $4)`,
      [input.merchantId, input.idempotencyKey, requestHash, reservation.id],
    );
    return reservation;
  });
}

export async function releaseClaim(
  merchantId: string,
  buyerId: string,
  reservationId: string,
) {
  return inTransaction(async (client) => {
    const selected = await client.query(
      `SELECT r.* FROM reservations r
      JOIN resources i ON i.id = r.resource_id
      WHERE r.id = $1 AND i.merchant_id = $2 AND r.buyer_id = $3 FOR UPDATE OF r`,
      [reservationId, merchantId, buyerId],
    );
    const reservation = selected.rows[0];
    if (!reservation)
      throw new ReservationError(
        'NOT_FOUND',
        'Reservation does not belong to this buyer.',
      );
    if (
      reservation.status !== 'PENDING_COMMITMENT' &&
      reservation.status !== 'RESERVED'
    )
      return reservation;
    const updated = await client.query(
      `UPDATE reservations SET status = 'RELEASED', ended_at = now()
      WHERE id = $1 RETURNING *`,
      [reservationId],
    );
    await client.query(
      `INSERT INTO reservation_events (reservation_id, event_type)
      VALUES ($1, 'RESERVATION_RELEASED')`,
      [reservationId],
    );
    return updated.rows[0];
  });
}

export async function expireDueClaims(limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new Error('Invalid expiration batch size.');
  return inTransaction(async (client) => {
    const expired = await client.query(
      `WITH due AS (
      SELECT id FROM reservations WHERE
        (status = 'PENDING_COMMITMENT' AND claim_expires_at <= now()) OR
        (status = 'RESERVED' AND expires_at <= now()) OR
        (status = 'PURCHASE_PENDING' AND purchase_expires_at <= now())
      ORDER BY claim_expires_at LIMIT $1 FOR UPDATE SKIP LOCKED
    ) UPDATE reservations r SET status = 'EXPIRED', ended_at = now()
      FROM due WHERE r.id = due.id RETURNING r.id`,
      [limit],
    );
    for (const row of expired.rows) {
      await client.query(
        `INSERT INTO reservation_events (reservation_id, event_type)
        VALUES ($1, 'RESERVATION_EXPIRED')`,
        [row.id],
      );
    }
    return expired.rows.length;
  });
}
