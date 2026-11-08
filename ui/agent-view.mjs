export function agentView(run, { connected = true, signedIn = true } = {}) {
  if (connected == null)
    return {
      kind: 'loading',
      short: 'Loading',
      message: 'Connecting',
      busy: false,
    };
  if (!connected)
    return {
      kind: 'offline',
      short: 'Offline',
      message: 'Connection lost',
      busy: false,
    };
  if (!signedIn)
    return {
      kind: 'idle',
      short: 'Sign in',
      message: 'Sign in to run',
      busy: false,
    };
  if (!run)
    return {
      kind: 'idle',
      short: 'Ready',
      message: 'Ready for a mission',
      busy: false,
    };
  // Terminal state takes precedence over an old in-flight execution record.
  const states = {
    FAILED: ['failed', 'Paused', 'Stopped safely'],
    LIMIT_REACHED: ['failed', 'Paused', 'Action limit reached'],
    POLICY_DENIED: [
      'blocked',
      'Blocked',
      run.result?.error === 'RESOURCE_SOLD'
        ? 'Resource sold'
        : 'Policy enforced',
    ],
    AWAITING_APPROVAL: ['approval', 'Approval', 'PayPal approval needed'],
    WAITING_FOR_AVAILABILITY: [
      'waiting',
      'Waiting',
      'Waiting for availability',
    ],
    COMPLETED: ['complete', 'Done', 'Mission complete'],
    QUEUED: ['queued', 'Queued', 'Waiting to start'],
  };
  if (states[run.status]) {
    const [kind, short, message] = states[run.status];
    return { kind, short, message, busy: false };
  }
  if (run.status === 'RUNNING')
    return {
      kind: 'running',
      short: 'Running',
      message:
        run.execution?.phase === 'TOOL_CALL'
          ? 'Calling a tool'
          : 'Choosing next action',
      busy: true,
    };
  return {
    kind: 'idle',
    short: 'Checking',
    message: 'Checking status',
    busy: false,
  };
}

export function eventView(step) {
  const result = step.result || {};
  if (
    result.http_status >= 500 ||
    [
      'INTERNAL_ERROR',
      'UNKNOWN_TOOL',
      'UNAUTHORIZED',
      'SIMULATED_TIMEOUT',
    ].includes(result.error)
  )
    return {
      kind: 'failed',
      label: result.error || 'Request failed',
      symbol: '!',
    };
  if (result.error)
    return { kind: 'blocked', label: result.error, symbol: '−' };
  if (result.waiting) return { kind: 'waiting', label: 'Waiting', symbol: '↳' };
  return {
    kind: 'complete',
    label: result.status || 'Response received',
    symbol: '✓',
  };
}
