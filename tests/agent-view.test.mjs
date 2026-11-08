import test from 'node:test';
import assert from 'node:assert/strict';
import { agentView, eventView } from '../ui/agent-view.mjs';

test('stale execution records never animate terminal or waiting agents', () => {
  for (const status of [
    'FAILED',
    'COMPLETED',
    'POLICY_DENIED',
    'AWAITING_APPROVAL',
    'WAITING_FOR_AVAILABILITY',
    'QUEUED',
  ]) {
    const view = agentView({ status, execution: { phase: 'MODEL_INFERENCE' } });
    assert.equal(view.busy, false, status);
    assert.notEqual(view.kind, 'running', status);
  }
  assert.equal(
    agentView({ status: 'FAILED', execution: { phase: 'TOOL_CALL' } }).message,
    'Stopped safely',
  );
});
test('lost connection and expired sessions cannot claim live execution', () => {
  const run = { status: 'RUNNING', execution: { phase: 'TOOL_CALL' } };
  assert.equal(agentView(run, { connected: false }).kind, 'offline');
  assert.equal(agentView(run, { connected: false }).busy, false);
  assert.equal(agentView(run, { signedIn: false }).busy, false);
  assert.equal(agentView(run, { signedIn: false }).short, 'Sign in');
});
test('busy activity requires a real RUNNING state', () => {
  assert.equal(
    agentView({ status: 'RUNNING', execution: { phase: 'TOOL_CALL' } }).busy,
    true,
  );
  assert.equal(agentView(null).busy, false);
  assert.equal(
    agentView({ status: 'UNKNOWN', execution: { phase: 'MODEL_INFERENCE' } })
      .busy,
    false,
  );
  assert.equal(agentView(null, { connected: null }).kind, 'loading');
  assert.equal(agentView(null, { connected: null }).busy, false);
});
test('rejected and failed tool responses are not displayed as successful checks', () => {
  assert.equal(
    eventView({ result: { error: 'UNAVAILABLE', http_status: 409 } }).kind,
    'blocked',
  );
  assert.notEqual(eventView({ result: { error: 'COOLDOWN' } }).symbol, '✓');
  assert.equal(
    eventView({ result: { http_status: 500, error: 'INTERNAL_ERROR' } }).kind,
    'failed',
  );
  assert.equal(eventView({ result: { waiting: true } }).kind, 'waiting');
  assert.equal(
    eventView({ result: { status: 'AUTHORIZED', http_status: 200 } }).kind,
    'complete',
  );
});
