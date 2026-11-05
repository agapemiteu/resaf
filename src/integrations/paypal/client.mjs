import { createHash } from 'node:crypto';

const base = 'https://api-m.sandbox.paypal.com';

function operationId(operation, reservationId) {
  return createHash('sha256').update(`${operation}:${reservationId}`).digest('hex').slice(0, 32);
}

export class PayPalError extends Error {
  constructor(operation, status, details) {
    super(`PayPal ${operation} failed (HTTP ${status}): ${details}`);
    this.operation = operation;
    this.status = status;
  }
}

async function readJson(response) {
  const body = await response.text();
  if (!body) return {};
  try { return JSON.parse(body); }
  catch { throw new Error(`PayPal returned invalid JSON (HTTP ${response.status}).`); }
}

async function accessToken() {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret || id.startsWith('replace-') || secret.startsWith('replace-')) {
    throw new Error('PayPal Sandbox credentials are not configured.');
  }
  const response = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15000),
  });
  const data = await readJson(response);
  if (!response.ok || !data.access_token) {
    throw new PayPalError('OAuth', response.status, data.error_description ?? data.error ?? 'missing access token');
  }
  return data.access_token;
}

async function request(path, { method = 'GET', body, requestId } = {}) {
  const token = await accessToken();
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
      ...(method === 'POST' ? { prefer: 'return=representation' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const data = await readJson(response);
  if (!response.ok) {
    const detail = data.details?.map((item) => item.description ?? item.issue).join('; ');
    throw new PayPalError(`${method} ${path}`, response.status, detail || data.message || data.name || 'unknown error');
  }
  return data;
}

export async function createCommitmentOrder({ reservationId, amount, currency, returnUrl, cancelUrl, intent = 'AUTHORIZE' }) {
  if (!['AUTHORIZE', 'CAPTURE'].includes(intent)) throw new Error('Invalid payment intent.');
  const order = await request('/v2/checkout/orders', {
    method: 'POST', requestId: operationId('commit', reservationId),
    body: {
      intent,
      purchase_units: [{ reference_id: reservationId, description: 'Resaf reservation commitment',
        amount: { currency_code: currency, value: amount } }],
      payment_source: { paypal: { experience_context: { return_url: returnUrl, cancel_url: cancelUrl } } },
    },
  });
  const link = order.links?.find((item) => ['payer-action', 'approve'].includes(item.rel))?.href;
  if (!order.id || !link) throw new Error('PayPal did not return an order and approval link.');
  const url = new URL(link);
  if (url.protocol !== 'https:' || !/(^|\.)paypal\.com$/i.test(url.hostname)) {
    throw new Error('PayPal returned an invalid approval host.');
  }
  return { orderId: order.id, approvalUrl: url.href, status: order.status };
}

export async function captureOrder(orderId, operationKey) {
  let order = await getOrder(orderId);
  if (order.status === 'APPROVED') {
    order = await request(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: 'POST', body: {}, requestId: operationId('capture', operationKey),
    });
  }
  const captureId = order.purchase_units?.flatMap((unit) => unit.payments?.captures ?? [])[0]?.id;
  return { status: order.status, capture: captureId ? await getCapture(captureId) : null };
}

export async function getOrder(orderId) {
  return request(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
}

export async function authorizeCommitment(orderId, reservationId) {
  const order = await getOrder(orderId);
  if (order.status === 'COMPLETED') {
    const existingId = order.purchase_units?.flatMap((unit) => unit.payments?.authorizations ?? [])[0]?.id;
    if (existingId) return { status: order.status, authorization: await getAuthorization(existingId) };
  }
  if (order.status !== 'APPROVED') return { status: order.status, authorization: null };
  const result = await request(`/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, {
    method: 'POST', body: {}, requestId: operationId('authorize', reservationId),
  });
  const authorizationId = result.purchase_units?.flatMap((unit) => unit.payments?.authorizations ?? [])[0]?.id;
  if (!authorizationId) throw new Error('PayPal did not return an authorization ID.');
  const authorization = await getAuthorization(authorizationId);
  return { status: result.status, authorization };
}

export async function getAuthorization(authorizationId) {
  return request(`/v2/payments/authorizations/${encodeURIComponent(authorizationId)}`);
}

export async function voidAuthorization(authorizationId, reservationId) {
  await request(`/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`, {
    method: 'POST', body: {}, requestId: operationId('void', reservationId),
  });
  return getAuthorization(authorizationId);
}

export async function createPaymentSetup({ setupId, returnUrl, cancelUrl }) {
  return request('/v3/vault/setup-tokens', {
    method: 'POST', requestId: operationId('setup', setupId),
    body: { payment_source: { paypal: {
      description: 'Resaf Sandbox reservation commitments',
      usage_type: 'MERCHANT', customer_type: 'CONSUMER', usage_pattern: 'IMMEDIATE',
      permit_multiple_payment_tokens: false,
      experience_context: { return_url: returnUrl, cancel_url: cancelUrl,
        shipping_preference: 'NO_SHIPPING', brand_name: 'Resaf Sandbox' },
    } } },
  });
}

export async function getPaymentSetup(setupTokenId) {
  return request(`/v3/vault/setup-tokens/${encodeURIComponent(setupTokenId)}`);
}

export async function savePaymentToken(setupTokenId) {
  const setup = await getPaymentSetup(setupTokenId);
  if (setup.status !== 'APPROVED') throw new Error(`PayPal payment setup is ${setup.status}.`);
  return request('/v3/vault/payment-tokens', {
    method: 'POST', requestId: operationId('save-token', setupTokenId),
    body: { payment_source: { token: { id: setupTokenId, type: 'SETUP_TOKEN' } } },
  });
}

export async function createSavedPayment({ operationKey, vaultId, amount, currency }) {
  return request('/v2/checkout/orders', {
    method: 'POST', requestId: operationId('saved-capture', operationKey),
    body: { intent: 'CAPTURE',
      purchase_units: [{ reference_id: operationKey, amount: { currency_code: currency, value: amount } }],
      payment_source: { paypal: { vault_id: vaultId } },
    },
  });
}

export async function getCapture(captureId) {
  return request(`/v2/payments/captures/${encodeURIComponent(captureId)}`);
}

export async function refundCapture({ captureId, operationKey, amount, currency }) {
  return request(`/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
    method: 'POST', requestId: operationId('refund', operationKey),
    body: { amount: { currency_code: currency, value: amount } },
  });
}

export async function getRefund(refundId) {
  return request(`/v2/payments/refunds/${encodeURIComponent(refundId)}`);
}
