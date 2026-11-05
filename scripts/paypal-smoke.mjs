import { randomUUID, createHash } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const apiBase = 'https://api-m.sandbox.paypal.com';
const [command, firstArg, secondArg] = process.argv.slice(2);
const journalPath = join(process.cwd(), '.local', 'paypal-smoke.jsonl');

function record(event, fields) {
  mkdirSync(dirname(journalPath), { recursive: true });
  appendFileSync(journalPath, JSON.stringify({ at: new Date().toISOString(), event, ...fields }) + '\n');
}

function usage() {
  console.log(`PayPal Sandbox authorization lifecycle check

Commands:
  npm run paypal:smoke -- create [request-id]
  npm run paypal:smoke -- authorize <order-id> [request-id]
  npm run paypal:smoke -- inspect <authorization-id>
  npm run paypal:smoke -- void <authorization-id> [request-id]

After create, open the approval URL returned by PayPal and approve with a
Sandbox buyer before running authorize. The script never uses production APIs.`);
}

function requireCredentials() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.local.');
  }

  return { clientId, clientSecret };
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`PayPal returned non-JSON content (HTTP ${response.status}).`);
  }
}

function describeFailure(data) {
  const details = Array.isArray(data.details)
    ? data.details.map((detail) => detail.description ?? detail.issue).filter(Boolean).join('; ')
    : '';
  return [data.name, data.message, details].filter(Boolean).join(': ');
}

async function getAccessToken() {
  const { clientId, clientSecret } = requireCredentials();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(30000)
  });
  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(`PayPal OAuth failed (HTTP ${response.status}): ${describeFailure(data)}`);
  }

  if (!data.access_token) {
    throw new Error('PayPal OAuth response did not include an access token.');
  }

  return data.access_token;
}

async function paypalRequest(path, { method = 'GET', body, requestId } = {}) {
  const accessToken = await getAccessToken();
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json'
  };

  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (requestId) headers['PayPal-Request-Id'] = requestId;
  if (method === 'POST') headers.Prefer = 'return=representation';

  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  });
  const data = await readJson(response);

  if (!response.ok) {
    const description = describeFailure(data);
    throw new Error(
      `PayPal ${method} ${path} failed (HTTP ${response.status})${description ? `: ${description}` : ''}`
    );
  }

  return data;
}

function makeRequestId(value) {
  return value || randomUUID();
}

function stableReferenceId(requestId) {
  return createHash('sha256').update(requestId).digest('hex').slice(0, 32);
}

async function createOrder(requestId) {
  const returnUrl = process.env.PAYPAL_RETURN_URL || 'https://example.com/resaf/paypal-return';
  const cancelUrl = process.env.PAYPAL_CANCEL_URL || 'https://example.com/resaf/paypal-cancel';
  record('CREATE_REQUESTED', { request_id: requestId });
  const order = await paypalRequest('/v2/checkout/orders', {
    method: 'POST',
    requestId,
    body: {
      intent: 'AUTHORIZE',
      purchase_units: [
        {
          reference_id: stableReferenceId(requestId),
          description: 'Resaf sandbox reservation commitment',
          amount: { currency_code: 'USD', value: '2.00' }
        }
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: returnUrl,
            cancel_url: cancelUrl
          }
        }
      }
    }
  });

  const approvalLink = order.links?.find((link) => ['payer-action', 'approve'].includes(link.rel))?.href;
  if (!approvalLink) {
    throw new Error(`PayPal created order ${order.id ?? '(unknown)'} without returning a buyer approval link.`);
  }

  const approvalUrl = new URL(approvalLink);
  if (approvalUrl.protocol !== 'https:' || !/(^|\.)paypal\.com$/i.test(approvalUrl.hostname)) {
    throw new Error('PayPal returned an approval link outside an HTTPS paypal.com domain.');
  }

  console.log(`Order ID: ${order.id}`);
  console.log(`Order status: ${order.status}`);
  console.log(`PayPal-Request-Id: ${requestId}`);
  console.log(`Buyer approval URL: ${approvalUrl.href}`);
  record('ORDER_CREATED', { order_id: order.id, status: order.status, request_id: requestId });
}

async function authorizeOrder(orderId, requestId) {
  if (!orderId) throw new Error('Provide an order ID.');

  const order = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  if (order.status !== 'APPROVED') {
    throw new Error(`Order ${orderId} is ${order.status ?? 'in an unknown state'}; buyer approval is required first.`);
  }

  record('AUTHORIZE_REQUESTED', { order_id: orderId, request_id: requestId });

  const result = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, {
    method: 'POST',
    requestId,
    body: {}
  });
  const authorization = result.purchase_units?.flatMap((unit) => unit.payments?.authorizations ?? [])[0];

  if (!authorization?.id) {
    throw new Error(`PayPal authorization response for order ${orderId} did not include an authorization ID.`);
  }

  const verified = await paypalRequest(`/v2/payments/authorizations/${encodeURIComponent(authorization.id)}`);
  record('AUTHORIZATION_VERIFIED', {
    order_id: orderId, authorization_id: verified.id, status: verified.status,
    amount: verified.amount?.value, currency: verified.amount?.currency_code, request_id: requestId
  });
  console.log(`Order ID: ${orderId}`);
  console.log(`Order status: ${result.status}`);
  console.log(`Authorization ID: ${verified.id}`);
  console.log(`Authorization status: ${verified.status}`);
  console.log(`Amount: ${verified.amount?.currency_code ?? 'unknown'} ${verified.amount?.value ?? 'unknown'}`);
  console.log(`PayPal-Request-Id: ${requestId}`);
}

async function inspectAuthorization(authorizationId) {
  if (!authorizationId) throw new Error('Provide an authorization ID.');

  const authorization = await paypalRequest(
    `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}`
  );
  record('AUTHORIZATION_INSPECTED', { authorization_id: authorization.id, status: authorization.status });
  console.log(`Authorization ID: ${authorization.id}`);
  console.log(`Authorization status: ${authorization.status}`);
  console.log(`Amount: ${authorization.amount?.currency_code ?? 'unknown'} ${authorization.amount?.value ?? 'unknown'}`);
}

async function voidAuthorization(authorizationId, requestId) {
  if (!authorizationId) throw new Error('Provide an authorization ID.');

  record('VOID_REQUESTED', { authorization_id: authorizationId, request_id: requestId });

  await paypalRequest(
    `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`,
    { method: 'POST', requestId, body: {} }
  );
  const verified = await paypalRequest(`/v2/payments/authorizations/${encodeURIComponent(authorizationId)}`);
  record('VOID_VERIFIED', { authorization_id: verified.id ?? authorizationId, status: verified.status, request_id: requestId });

  if (verified.status !== 'VOIDED') {
    throw new Error(`Authorization ${authorizationId} is ${verified.status ?? 'in an unknown state'} after void request; inspect it before retrying.`);
  }

  console.log(`Authorization ID: ${verified.id ?? authorizationId}`);
  console.log(`Authorization status: ${verified.status}`);
  console.log(`PayPal-Request-Id: ${requestId}`);
}

async function main() {
  if (!command || command === '--help' || command === '-h') {
    usage();
    return;
  }

  if (command === 'create') {
    await createOrder(makeRequestId(firstArg));
    return;
  }

  if (command === 'authorize') {
    await authorizeOrder(firstArg, makeRequestId(secondArg));
    return;
  }

  if (command === 'inspect') {
    await inspectAuthorization(firstArg);
    return;
  }

  if (command === 'void') {
    await voidAuthorization(firstArg, makeRequestId(secondArg));
    return;
  }

  usage();
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
