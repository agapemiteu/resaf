import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createPaymentSetup, getPaymentSetup, savePaymentToken } from '../src/integrations/paypal/client.mjs';

const path = new URL('../.local/saved-payment-setup.json', import.meta.url);
await mkdir(new URL('../.local/', import.meta.url), { recursive: true });
const command = process.argv[2];
let state = await readFile(path, 'utf8').then(JSON.parse).catch(() => null);
if (command === 'create') {
  if (state?.setupTokenId) throw new Error('A setup already exists. Use status or confirm.');
  state ??= { operationKey: randomUUID() };
  await writeFile(path, JSON.stringify(state));
  const result = await createPaymentSetup({ setupId: state.operationKey,
    returnUrl: 'https://resaf-api.onrender.com/paypal/return',
    cancelUrl: 'https://resaf-api.onrender.com/paypal/cancel' });
  const link = result.links?.find((item) => item.rel === 'approve')?.href;
  if (!result.id || !link || new URL(link).protocol !== 'https:' ||
      !/(^|\.)paypal\.com$/i.test(new URL(link).hostname)) throw new Error('Invalid PayPal setup response.');
  state.setupTokenId = result.id;
  await writeFile(path, JSON.stringify(state));
  console.log(JSON.stringify({ status: result.status, approval_url: link }));
} else if (command === 'status') {
  if (!state?.setupTokenId) throw new Error('Create a setup first.');
  console.log(JSON.stringify({ status: (await getPaymentSetup(state.setupTokenId)).status }));
} else if (command === 'confirm') {
  if (!state?.setupTokenId) throw new Error('Create a setup first.');
  if (state.vaultId) throw new Error('Payment token is already saved.');
  const result = await savePaymentToken(state.setupTokenId);
  if (!result.id) throw new Error('PayPal did not return a payment token.');
  state.vaultId = result.id;
  state.customerId = result.customer?.id;
  await writeFile(path, JSON.stringify(state));
  console.log(JSON.stringify({ saved: true, payment_source: 'paypal', token_displayed: false }));
} else {
  throw new Error('Use create, status, or confirm.');
}
