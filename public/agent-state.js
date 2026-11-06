export function selectRun(runs, buyerId, resourceId, current) {
  runs=runs.filter(r=>!r.kind || r.kind==='SHOPPER');
  // A freshly started run may only have searched the catalog so far.
  const pinned=runs.find(r=>r.id===current?.id && r.buyer_id===buyerId);
  if(current?.id && ['QUEUED','RUNNING'].includes(current.status)) return pinned||current;
  const candidate=runs.find(r=>r.buyer_id===buyerId && (r.resource_id===resourceId ||
    r.result?.resource_id===resourceId || r.objective.includes(resourceId) ||
    r.steps?.some(s=>s.arguments?.resource_id===resourceId)));
  if(pinned && (!candidate || new Date(pinned.created_at)>new Date(candidate.created_at))) return pinned;
  return candidate || null;
}

export function contenderRow(name, run, reservation) {
  const latest=run?.steps?.at(-1);
  const claimed=reservation && ['PENDING_COMMITMENT','RESERVED','PURCHASE_PENDING','PURCHASED'].includes(reservation.status);
  const outcome=run?.result?.error || reservation?.status || run?.status || 'NOT_STARTED';
  return {id:name,actor:`Agent ${name.toUpperCase()}`,action:latest?.tool?.replaceAll('_',' ') || 'Awaiting mission',
    outcome, ownership:claimed ? reservation.status==='PENDING_COMMITMENT'?'PROVISIONAL CLAIM':'VERIFIED EXCLUSIVITY' : 'NO CLAIM',
    next:run?.status==='WAITING_FOR_AVAILABILITY'?'Wait, then retry when available':outcome==='RESOURCE_SOLD'?'Stop: resource sold':
      run?.status==='AWAITING_APPROVAL'?'Buyer approves PayPal':run?.status==='FAILED'?'Business alerted':
      outcome==='PURCHASED'?'Receipt issued':outcome==='RESERVED'?'Book or release':run?.status==='POLICY_DENIED'?'Respect policy; stop':'Agent chooses next tool',
    evidence:run};
}
