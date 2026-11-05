import { readFile } from 'node:fs/promises';
import pg from 'pg';

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('replace-with')) {
  throw new Error('Set DATABASE_URL in .env.local first.');
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY)`);
  const installed = await client.query(`SELECT version FROM schema_migrations WHERE version = '0001_initial'`);
  if (!installed.rowCount) {
    await client.query(await readFile(new URL('../src/db/migrations/0001_initial.sql', import.meta.url), 'utf8'));
    await client.query(`INSERT INTO schema_migrations (version) VALUES ('0001_initial')`);
  }
  await client.query(await readFile(new URL('../src/db/seed.sql', import.meta.url), 'utf8'));
  const result = await client.query(`SELECT r.id, r.title, r.status, p.commitment_amount, p.hold_duration_seconds
    FROM resources r JOIN reservation_policies p ON p.resource_id = r.id WHERE r.id = 'bag-001'`);
  await client.query('COMMIT');
  console.log(JSON.stringify(result.rows[0]));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
