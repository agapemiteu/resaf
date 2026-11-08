import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneView, isRoundFinished, quotedTerms } from '../ui/scene-state.mjs';

const base = {
  roundActive: true,
  connected: true,
  signedIn: true,
  busy: false,
  resource: { status: 'AVAILABLE' },
  agents: { a: {}, b: {} },
};
const agent = (status, reservationStatus) => ({
  run: { status },
  ...(reservationStatus
    ? { reservation: { status: reservationStatus, id: 'r' } }
    : {}),
});
test('an idle scene never reopens a previous sale', () => {
  assert.equal(
    sceneView({ ...base, roundActive: false, resource: { status: 'SOLD' } })
      .phase,
    'ready',
  );
});
test('all primary reservation paths map to distinct controls', () => {
  for (const [reservationStatus, phase] of [
    ['PENDING_COMMITMENT', 'commitment'],
    ['RESERVED', 'reserved'],
    ['PURCHASE_PENDING', 'purchase'],
  ])
    assert.equal(
      sceneView({
        ...base,
        agents: { a: agent('AWAITING_APPROVAL', reservationStatus) },
      }).phase,
      phase,
    );
  assert.equal(
    sceneView({ ...base, agents: { a: agent('RUNNING') } }).phase,
    'running',
  );
  assert.equal(
    sceneView({ ...base, agents: { b: agent('WAITING_FOR_AVAILABILITY') } })
      .phase,
    'waiting',
  );
  assert.equal(
    sceneView({ ...base, agents: { a: agent('FAILED') } }).phase,
    'paused',
  );
});
test('connection loss and expired sessions take precedence over stale actions', () => {
  const claimed = { ...base, agents: { a: agent('RUNNING', 'RESERVED') } };
  assert.equal(sceneView({ ...claimed, connected: false }).phase, 'offline');
  assert.equal(sceneView({ ...claimed, signedIn: false }).phase, 'auth');
});
test('a failed model cannot discard an unresolved financial claim', () => {
  for (const status of ['PENDING_COMMITMENT', 'RESERVED', 'PURCHASE_PENDING'])
    assert.equal(
      isRoundFinished({ a: agent('FAILED', status) }, base.resource),
      false,
    );
  assert.equal(isRoundFinished({ a: agent('FAILED') }, base.resource), true);
});
test('waiting rivals keep the current scene active after release or expiry', () => {
  for (const status of ['RELEASED', 'EXPIRED'])
    assert.equal(
      isRoundFinished(
        { a: agent('COMPLETED', status), b: agent('WAITING_FOR_AVAILABILITY') },
        base.resource,
      ),
      false,
    );
  assert.equal(
    isRoundFinished(
      { a: agent('COMPLETED', 'RELEASED'), b: agent('POLICY_DENIED') },
      base.resource,
    ),
    true,
  );
  assert.equal(
    isRoundFinished(
      { a: agent('AWAITING_APPROVAL', 'EXPIRED') },
      base.resource,
    ),
    true,
  );
  assert.equal(isRoundFinished({ a: {}, b: {} }, base.resource), false);
});
test('active quotes use accepted refund terms rather than a newer policy', () => {
  const original = { purchase_refund_bps: 5000, hold_duration_seconds: 600 };
  const changed = {
    id: 'new',
    purchase_refund_bps: 10000,
    hold_duration_seconds: 1200,
  };
  assert.equal(
    quotedTerms(
      { reservation: { id: 'r', policy_id: 'old', terms: original } },
      changed,
    ),
    original,
  );
  assert.equal(
    quotedTerms({ reservation: { id: 'r', policy_id: 'old' } }, changed),
    null,
  );
  assert.equal(quotedTerms(null, changed), changed);
});
test('finished reservations remain visible while financial settlement is unresolved', () => {
  for (const payment of [
    { type: 'COMMITMENT_FEE', status: 'CAPTURE_REQUESTED' },
    {
      type: 'COMMITMENT_FEE',
      status: 'CAPTURED',
      provider_capture_id: 'test-fee',
    },
    {
      type: 'RESERVATION_AUTHORIZATION',
      status: 'VOID_FAILED',
      provider_authorization_id: 'test-auth',
    },
    { type: 'COMMITMENT_REFUND', status: 'REFUND_PENDING' },
  ]) {
    const agents = {
      a: {
        run: { status: 'COMPLETED' },
        reservation: { status: 'PURCHASED', payments: [payment] },
      },
    };
    assert.equal(isRoundFinished(agents, { status: 'SOLD' }), false);
    assert.equal(
      sceneView({ ...base, agents, resource: { status: 'SOLD' } }).phase,
      'settling',
    );
  }
  const settled = {
    a: {
      run: { status: 'COMPLETED' },
      reservation: {
        status: 'PURCHASED',
        payments: [
          {
            type: 'COMMITMENT_FEE',
            status: 'SETTLED',
            provider_capture_id: 'test-fee',
          },
        ],
      },
    },
  };
  assert.equal(isRoundFinished(settled, { status: 'SOLD' }), true);
});
