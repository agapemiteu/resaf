import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';

if (
  !process.env.DATABASE_URL ||
  process.env.DATABASE_URL.includes('replace-with')
) {
  throw new Error('Set DATABASE_URL in .env.local first.');
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY)`,
  );
  const directory = new URL('../src/db/migrations/', import.meta.url);
  for (const file of (await readdir(directory))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const version = file.slice(0, -4);
    const installed = await client.query(
      `SELECT version FROM schema_migrations WHERE version = $1`,
      [version],
    );
    if (!installed.rowCount) {
      await client.query(await readFile(new URL(file, directory), 'utf8'));
      await client.query(
        `INSERT INTO schema_migrations (version) VALUES ($1)`,
        [version],
      );
    }
  }
  await client.query(
    await readFile(new URL('../src/db/seed.sql', import.meta.url), 'utf8'),
  );
  await client.query(`CREATE TABLE IF NOT EXISTS maintenance_status (
    name text PRIMARY KEY, completed_at timestamptz NOT NULL, source text NOT NULL, result jsonb NOT NULL)`);
  const result =
    await client.query(`SELECT r.id, r.title, r.status, p.commitment_amount, p.hold_duration_seconds
    FROM resources r JOIN reservation_policies p ON p.resource_id = r.id
    WHERE r.id = 'demo-resource-001' AND p.effective_at <= now()
    ORDER BY p.effective_at DESC, p.version DESC LIMIT 1`);
  await client.query('COMMIT');
  console.log(JSON.stringify(result.rows[0]));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
