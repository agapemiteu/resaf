import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDemoSession,
  merchantSession,
  publicDemoSession,
  demoResourceAllowed,
  demoControlAllowed,
} from '../src/lib/session.mjs';
process.env.CALLBACK_SIGNING_SECRET =
  'test-session-secret-never-used-outside-tests';
const request = (token, url = '/api/v1/merchant/activity', method = 'GET') => ({
  headers: { cookie: `resaf_session=${token}` },
  url,
  method,
});
test('a public demo session cannot become a merchant session', () => {
  const req = request(
    createDemoSession({ role: 'demo', resourceId: 'demo-one' }),
  );
  assert.equal(merchantSession(req), false);
  assert.equal(publicDemoSession(req).resourceId, 'demo-one');
  assert.equal(demoResourceAllowed(req, 'demo-one'), true);
  assert.equal(demoResourceAllowed(req, 'bag-001'), false);
});
test('public demo controls are limited to the demo and its current resource', () => {
  const token = createDemoSession({ role: 'demo', resourceId: 'demo-one' });
  assert.equal(demoControlAllowed(request(token)), true);
  assert.equal(
    demoControlAllowed(request(token, '/api/demo/rounds', 'POST')),
    true,
  );
  assert.equal(
    demoControlAllowed(
      request(token, '/api/v1/resources/demo-one/policy', 'POST'),
    ),
    true,
  );
  assert.equal(
    demoControlAllowed(
      request(token, '/api/v1/resources/bag-001/policy', 'POST'),
    ),
    false,
  );
  assert.equal(
    demoControlAllowed(request(token, '/internal/expire', 'POST')),
    false,
  );
});
test('tampered sessions are rejected and merchant sessions remain separate', () => {
  const token = createDemoSession({ role: 'demo' });
  const [body, signature] = token.split('.');
  const forged = Buffer.from(
    JSON.stringify({ role: 'merchant', expires: Date.now() + 100000 }),
  ).toString('base64url');
  assert.equal(merchantSession(request(`${forged}.${signature}`)), false);
  assert.equal(publicDemoSession(request(`${body}.invalid`)), null);
  assert.equal(merchantSession(request(createDemoSession())), true);
});
