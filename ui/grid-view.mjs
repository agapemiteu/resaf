const names={NOT_STARTED:'Ready',QUEUED:'Queued',RUNNING:'Working',AWAITING_APPROVAL:'Needs approval',PENDING_COMMITMENT:'Needs approval',RESERVED:'Reserved',PURCHASE_PENDING:'Checkout',PURCHASED:'Booked',WAITING_FOR_AVAILABILITY:'Waiting',UNAVAILABLE:'Unavailable',FAILED:'Needs review',LIMIT_REACHED:'Needs review',POLICY_DENIED:'Not eligible',COOLDOWN:'Cooldown',RESOURCE_SOLD:'Sold',BUYER_LIMIT:'Hold limit',RELEASED:'Released',EXPIRED:'Expired'};
export function readable(value){return names[value]||String(value||'Pending').replaceAll('_',' ').toLowerCase().replace(/^./,c=>c.toUpperCase());}
export function presentRaceRow(row){
  const access=row.outcome==='PURCHASED'?'Booked':row.ownership==='PROVISIONAL CLAIM'?'Checkout claim':row.ownership==='VERIFIED EXCLUSIVITY'?'Reserved':'No claim';
  const tone=['FAILED','LIMIT_REACHED'].includes(row.outcome)?'error':row.outcome==='PURCHASED'?'booked':access==='Reserved'?'reserved':access==='Checkout claim'?'claim':row.waiting?'waiting':'neutral';
  const next=['RELEASED','EXPIRED'].includes(row.outcome)?'Hold ended':row.outcome==='NOT_STARTED'?'Run to start':row.outcome==='COMPLETED'&&access==='No claim'?'Finished':row.next==='Agent chooses next tool'?'Choosing next action':row.next==='Wait, then retry when available'?'Wait for availability':row.next==='Buyer approves PayPal'?'Approve in PayPal':row.next;
  return {...row,access,statusLabel:readable(row.outcome),tone,next};
}
export function requestStages(run,outcome){
  const stages=[{label:'Discover',state:'idle'},{label:'Claim',state:'idle'},{label:'Commit',state:'idle'},{label:'Book',state:'idle'}];
  for(const step of run?.steps||[]){
    const index=['search_resources','get_resource','get_policy'].includes(step.tool)?0:step.tool==='request_reservation'?1:step.tool==='start_commitment'?2:step.tool==='request_purchase_approval'?3:-1;
    if(index<0)continue;
    const result=step.result||{};
    stages[index].state=result.error||result.http_status>=400?'blocked':result.approval_url||result.purchase_status==='APPROVAL_REQUIRED'?'pending':'done';
    if(step.tool==='start_commitment'&&result.status==='APPROVAL_REQUIRED')stages[index].state='pending';
  }
  if(['RESERVED','PURCHASE_PENDING','PURCHASED'].includes(outcome))stages[2].state='done';
  if(outcome==='PURCHASE_PENDING')stages[3].state='pending';
  if(outcome==='PURCHASED')stages[3].state='done';
  return stages;
}
export function raceSummary(rows){
  const formatted=rows.map(presentRaceRow);
  const owner=formatted.find(row=>['Booked','Reserved','Checkout claim'].includes(row.access));
  if(owner)return `${owner.actor} ${owner.access==='Booked'?'completed the booking':owner.access==='Reserved'?'has the reservation':'has the checkout claim'}`;
  if(formatted.some(row=>['RUNNING','QUEUED'].includes(row.outcome)))return 'Requests in progress';
  if(formatted.some(row=>row.tone==='error'))return 'A request needs review';
  if(formatted.every(row=>row.outcome==='NOT_STARTED'))return 'Ready for two requests';
  return 'No active claim';
}
