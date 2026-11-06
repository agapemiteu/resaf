import pg from 'pg';
import { randomUUID } from 'node:crypto';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
async function freeHold(buyer, resourceId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO legacy_demo_holds (resource_id) VALUES ($1) ON CONFLICT DO NOTHING`, [resourceId]);
    const current = (await client.query(`SELECT *, expires_at > now() AS active FROM legacy_demo_holds WHERE resource_id=$1 FOR UPDATE`, [resourceId])).rows[0];
    const denied = Boolean(current.active && current.holder !== buyer);
    const event = { id: randomUUID(), resource_id:resourceId, actor: `Scripted client ${buyer.toUpperCase()}`, category: 'COMPARISON',
      action: denied ? 'FREE_HOLD_BLOCKED' : current.active ? 'FREE_HOLD_RENEWED' : 'FREE_HOLD_CREATED',
      outcome: denied ? 'UNAVAILABLE' : 'FREE_EXCLUSIVITY_GRANTED', amount: '0.00', occurred_at: new Date().toISOString() };
    await client.query(`UPDATE legacy_demo_holds SET holder=CASE WHEN $1 THEN holder ELSE $2 END,
      expires_at=CASE WHEN $1 THEN expires_at ELSE now()+interval '1 minute' END,
      renewals=renewals+CASE WHEN NOT $1 AND $3 THEN 1 ELSE 0 END,
      events=events || $4::jsonb WHERE resource_id=$5`, [denied,buyer,Boolean(current.active),JSON.stringify([event]),resourceId]);
    await client.query('COMMIT'); return event;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export async function legacyComparison(resourceId) {
  const events = [];
  for (let n=0;n<3;n++) events.push(await freeHold('a',resourceId));
  events.push(await freeHold('b',resourceId));
  return { mode: 'unprotected_comparison', events, resaf_inventory_changed: false };
}
export async function legacyEvidence() {
  const rows = (await pool.query(`SELECT events FROM legacy_demo_holds`)).rows;
  return rows.flatMap(row=>row.events).slice(-100).map(event => ({ ...event, evidence: event }));
}
