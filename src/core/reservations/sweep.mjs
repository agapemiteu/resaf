import pg from 'pg';
import { expireDueClaims } from './claims.ts';
import { voidOutstanding } from './commitment.mjs';
import { reconcileFeeCaptures } from './fees.mjs';
import { evaluatePolicies } from '../policies/config.mjs';
import { reconcilePurchases } from './purchase.mjs';
import { processWaitingAgents } from '../../agents/shopper.mjs';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

export async function runExpirationSweep() {
  const purchaseErrors = await reconcilePurchases();
  let expired = 0;
  let batch;
  do {
    batch = await expireDueClaims(100);
    expired += batch;
  } while (batch === 100);
  await reconcileFeeCaptures();

  const pending = await pool.query(`SELECT DISTINCT r.id FROM reservations r
    JOIN payment_transactions p ON p.reservation_id = r.id
    WHERE r.status IN ('EXPIRED', 'RELEASED', 'FAILED', 'PURCHASED')
      AND ((p.type = 'RESERVATION_AUTHORIZATION' AND p.provider_authorization_id IS NOT NULL
        AND p.status IN ('AUTHORIZED', 'VOID_PENDING', 'VOID_FAILED')) OR
        (p.type = 'COMMITMENT_FEE' AND p.provider_capture_id IS NOT NULL AND p.status <> 'SETTLED'))
    ORDER BY r.id LIMIT 100`);
  let voided = 0;
  let settled = 0;
  let failed = purchaseErrors;
  for (const row of pending.rows) {
    try {
      const status = await voidOutstanding(row.id);
      if (status === 'VOIDED') voided += 1;
      if (status === 'SETTLED') settled += 1;
    } catch (error) {
      failed += 1;
      console.error(`Void retry failed for reservation ${row.id}:`, error);
    }
  }
  const policiesChanged = await evaluatePolicies();
  await processWaitingAgents();
  return { expired, voided, settled, failed, policies_changed: policiesChanged };
}
