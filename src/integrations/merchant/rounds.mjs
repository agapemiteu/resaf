import pg from 'pg';
import { randomUUID } from 'node:crypto';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:2});

// A new simulated merchant unit, never a reset of a paid reservation or sale.
export async function createDemoRound(merchantId, requestKey) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT id FROM merchants WHERE id=$1 FOR UPDATE`,[merchantId]);
    const existing=await client.query(`SELECT * FROM demo_rounds WHERE merchant_id=$1 AND request_key=$2`,[merchantId,requestKey]);
    if(existing.rowCount){await client.query('COMMIT');return existing.rows[0];}
    const active=await client.query(`SELECT r.id FROM reservations r JOIN resources i ON i.id=r.resource_id
      WHERE i.merchant_id=$1 AND r.status IN ('PENDING_COMMITMENT','RESERVED','PURCHASE_PENDING')
      AND CASE WHEN r.status='PENDING_COMMITMENT' THEN r.claim_expires_at WHEN r.status='RESERVED' THEN r.expires_at ELSE r.purchase_expires_at END > now()`,[merchantId]);
    if(active.rowCount) throw new Error('Finish or release the current claim before starting another round.');
    const resourceId=`demo-${randomUUID()}`;
    await client.query(`INSERT INTO resources (id,merchant_id,title,description,price,currency,quantity,kind)
      VALUES ($1,$2,'Parking space P-01','Fresh Sandbox demonstration unit; previous sales and payments are preserved.',25.00,'USD',1,'parking')`,[resourceId,merchantId]);
    await client.query(`INSERT INTO reservation_policies
      (id,merchant_id,resource_id,version,commitment_amount,currency,hold_duration_seconds,approval_claim_seconds,
       max_active_holds_per_buyer,repeat_cooldown_seconds,payment_mode,purchase_refund_bps,release_refund_bps,expiry_refund_bps,automation)
      SELECT $1,$2,$3,1,commitment_amount,currency,hold_duration_seconds,approval_claim_seconds,
       max_active_holds_per_buyer,repeat_cooldown_seconds,payment_mode,purchase_refund_bps,release_refund_bps,expiry_refund_bps,automation
      FROM reservation_policies WHERE resource_id='demo-resource-001' AND merchant_id=$2 AND effective_at<=now()
      ORDER BY effective_at DESC,version DESC LIMIT 1`,[randomUUID(),merchantId,resourceId]);
    const round=await client.query(`INSERT INTO demo_rounds (merchant_id,resource_id,request_key) VALUES ($1,$2,$3) RETURNING *`,[merchantId,resourceId,requestKey]);
    await client.query('COMMIT');return round.rows[0];
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
