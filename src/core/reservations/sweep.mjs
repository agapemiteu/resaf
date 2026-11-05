import pg from 'pg';
import { expireDueClaims } from './claims.ts';
import { voidOutstanding } from './commitment.mjs';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

export async function runExpirationSweep() {
  let expired = 0;
  let batch;
  do {
    batch = await expireDueClaims(100);
    expired += batch;
  } while (batch === 100);

  const pending = await pool.query(`SELECT DISTINCT r.id FROM reservations r
    JOIN payment_transactions p ON p.reservation_id = r.id
    WHERE r.status IN ('EXPIRED', 'RELEASED', 'FAILED')
      AND p.type = 'RESERVATION_AUTHORIZATION'
      AND p.provider_authorization_id IS NOT NULL
      AND p.status IN ('AUTHORIZED', 'VOID_PENDING', 'VOID_FAILED')
    ORDER BY r.id LIMIT 100`);
  let voided = 0;
  let failed = 0;
  for (const row of pending.rows) {
    try {
      if (await voidOutstanding(row.id) === 'VOIDED') voided += 1;
    } catch (error) {
      failed += 1;
      console.error(`Void retry failed for reservation ${row.id}:`, error);
    }
  }
  return { expired, voided, failed };
}
