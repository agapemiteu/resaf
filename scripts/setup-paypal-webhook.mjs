import { readFile, writeFile } from 'node:fs/promises';
import { ensureWebhook } from '../src/integrations/paypal/client.mjs';
const base = process.argv[2] || process.env.RENDER_EXTERNAL_URL;
if (!base || new URL(base).protocol !== 'https:') {
  throw new Error(
    'Supply the public HTTPS application URL as the first argument.',
  );
}
const webhook = await ensureWebhook(new URL('/api/webhooks/paypal', base).href);
if (!webhook.id) throw new Error('PayPal did not return a webhook ID.');
const file = new URL('../.env.local', import.meta.url);
let env = await readFile(file, 'utf8');
if (/^PAYPAL_WEBHOOK_ID=/m.test(env))
  env = env.replace(
    /^PAYPAL_WEBHOOK_ID=.*$/m,
    `PAYPAL_WEBHOOK_ID=${webhook.id}`,
  );
else env += `\nPAYPAL_WEBHOOK_ID=${webhook.id}\n`;
await writeFile(file, env);
console.log(
  JSON.stringify({
    webhook_id: webhook.id,
    url: webhook.url,
    configured_locally: true,
  }),
);
