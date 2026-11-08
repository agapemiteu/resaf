const liveClaims = ['PENDING_COMMITMENT', 'RESERVED', 'PURCHASE_PENDING'];
const executing = ['QUEUED', 'RUNNING', 'WAITING_FOR_AVAILABILITY'];

export function hasUnsettledPayment(agents) {
  return Object.values(agents).some((agent) =>
    (agent.reservation?.payments || []).some(
      (payment) =>
        [
          'CAPTURE_REQUESTED',
          'CAPTURE_PENDING',
          'CAPTURE_RECONCILE',
          'PURCHASE_REFUND_PENDING',
          'REFUND_PENDING',
          'VOID_PENDING',
          'VOID_FAILED',
        ].includes(payment.status) ||
        (payment.type === 'COMMITMENT_FEE' &&
          payment.provider_capture_id &&
          payment.status !== 'SETTLED') ||
        (payment.type === 'RESERVATION_AUTHORIZATION' &&
          payment.provider_authorization_id &&
          payment.status !== 'VOIDED'),
    ),
  );
}

export function isRoundFinished(agents, resource) {
  if (hasUnsettledPayment(agents)) return false;
  if (resource?.status === 'SOLD') return true;
  const participants = Object.values(agents).filter((agent) => agent.run);
  if (!participants.length) return false;
  if (
    participants.some((agent) => liveClaims.includes(agent.reservation?.status))
  )
    return false;
  return participants.every(
    (agent) =>
      !executing.includes(agent.run.status) &&
      (['COMPLETED', 'FAILED', 'LIMIT_REACHED', 'POLICY_DENIED'].includes(
        agent.run.status,
      ) ||
        ['RELEASED', 'EXPIRED', 'FAILED'].includes(agent.reservation?.status)),
  );
}

export function sceneView({
  roundActive,
  connected,
  signedIn,
  busy,
  agents,
  resource,
}) {
  if (connected === false)
    return { phase: 'offline', title: 'Connection lost', action: 'Reconnect' };
  if (!roundActive)
    return { phase: 'ready', title: 'Two agents. One space.', action: 'Run' };
  if (!signedIn)
    return { phase: 'auth', title: 'Sign in to continue', action: 'Sign in' };
  const holder = Object.entries(agents).find(([, agent]) =>
    liveClaims.includes(agent.reservation?.status),
  );
  const running = Object.values(agents).some((agent) =>
    ['QUEUED', 'RUNNING'].includes(agent.run?.status),
  );
  if (holder) {
    const [buyer, agent] = holder,
      state = agent.reservation.status;
    const common = { buyer, reservation: agent.reservation };
    if (state === 'PENDING_COMMITMENT')
      return {
        ...common,
        phase: 'commitment',
        title: `Agent ${buyer.toUpperCase()} has the claim`,
        action: 'Approve in PayPal',
      };
    if (state === 'PURCHASE_PENDING')
      return {
        ...common,
        phase: 'purchase',
        title: 'Complete booking',
        action: 'Pay in PayPal',
      };
    return {
      ...common,
      phase: 'reserved',
      title: `Reserved by Agent ${buyer.toUpperCase()}`,
      action: running ? 'Agent working…' : 'Complete booking',
    };
  }
  if (hasUnsettledPayment(agents))
    return {
      phase: 'settling',
      title: 'Settling commitment',
      action: 'Checking…',
    };
  if (resource?.status === 'SOLD')
    return {
      phase: 'settling',
      title: 'Confirming payment',
      action: 'Checking…',
    };
  if (busy || running)
    return { phase: 'running', title: 'Agents running', action: 'Running…' };
  if (
    Object.values(agents).some(
      (agent) => agent.run?.status === 'WAITING_FOR_AVAILABILITY',
    )
  )
    return {
      phase: 'waiting',
      title: 'Waiting for availability',
      action: 'Waiting…',
    };
  return { phase: 'paused', title: 'Agent paused', action: 'Run' };
}

export function quotedTerms(owner, current) {
  if (!owner?.reservation) return current;
  return (
    owner.reservation.terms ||
    owner.run?.steps?.find(
      (step) =>
        step.tool === 'request_reservation' &&
        step.result?.reservation_id === owner.reservation.id,
    )?.result?.terms ||
    (owner.reservation.policy_id === current?.id ? current : null)
  );
}
