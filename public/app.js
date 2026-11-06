const $ = id => document.getElementById(id);
const RESOURCE_ID = 'demo-resource-001';
let signedIn = false, policy, grid, decisions = [], live = true;
let afterLoginAgent;
const agents = { a: {}, b: {} };
function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
async function api(path, options = {}, buyer) {
  const response = await fetch(path, { ...options, headers: { 'content-type': 'application/json',
    ...(buyer ? { 'X-Demo-Buyer': buyer } : {}), ...(options.method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}), ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message || data.error || `HTTP ${response.status}`), { status: response.status });
  return data;
}
const money = (value, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value));
function button(label, action) { const b = document.createElement('button'); b.className = 'quiet'; b.textContent = label; b.onclick = () => action().catch(error => notice(error.message)); return b; }
function configureGrid() {
  if (grid) return;
  if (!window.agGrid) {
    $('decision-grid').hidden = true; $('grid-fallback').hidden = false;
    $('grid-fallback').textContent = 'AG Grid could not load. API evidence remains available below.';
    return;
  }
  $('decision-grid').hidden = false; $('grid-fallback').hidden = true;
  grid = agGrid.createGrid($('decision-grid'), {
    theme: agGrid.themeQuartz.withParams({ fontFamily: 'DM Sans, system-ui, sans-serif', fontSize: 12,
      headerFontSize: 10, headerFontWeight: 500, backgroundColor: '#ffffff', headerBackgroundColor: '#f2f5ee',
      foregroundColor: '#182d2a', borderColor: '#dce3dc', accentColor: '#12694d', rowBorder: true }),
    defaultColDef: { sortable: true, resizable: true, filter: true },
    columnDefs: [
      { field: 'occurred_at', headerName: 'TIME', width: 105, valueFormatter: p => new Date(p.value).toLocaleTimeString() },
      { field: 'actor', headerName: 'ACTOR', width: 120 }, { field: 'category', headerName: 'LAYER', width: 115 },
      { field: 'action', headerName: 'DECISION / ACTION', flex: 2, minWidth: 240 },
      { field: 'amount', headerName: 'COMMITMENT', width: 120, valueFormatter: p => p.value ? money(p.value) : '—' },
      { field: 'policy_version', headerName: 'POLICY', width: 95, valueFormatter: p => p.value ? `v${p.value}` : '—' },
      { field: 'outcome', headerName: 'VERIFIED RESULT', flex: 1, minWidth: 180 },
    ], rowHeight: 43, headerHeight: 38, animateRows: false, getRowId: p => p.data.id,
    rowClassRules: { 'decision-bad': p => /DENIED|UNAVAILABLE|COOLDOWN|FAILED/.test(p.data.outcome || ''),
      'decision-good': p => /CONFIRMED|SETTLED|CAPTURED|REFUNDED|PURCHASED/.test(p.data.outcome || '') },
    onRowClicked: p => { $('evidence-json').textContent = JSON.stringify(p.data.evidence, null, 2); $('evidence').open = true; },
  });
}
function renderDecisions() {
  const slider = $('replay'); slider.max = decisions.length;
  if (live) slider.value = decisions.length;
  const count = Number(slider.value);
  $('replay-label').textContent = live ? `LIVE · ${decisions.length}` : `REPLAY · ${count}/${decisions.length}`;
  grid?.setGridOption('rowData', decisions.slice(0, count));
}
function renderAgent(name, run) {
  if (!run) return;
  agents[name].run = run;
  if (name === 'a') renderLiveAgent(run);
  const labels = { QUEUED:'REQUEST QUEUED',RUNNING:'AGENT REQUESTING',AWAITING_APPROVAL:'COMMITMENT REQUIRED',
    WAITING_FOR_AVAILABILITY:'WAITING FOR AVAILABILITY',POLICY_DENIED:'POLICY ENFORCED',FAILED:'AGENT UNAVAILABLE',COMPLETED:'REQUEST COMPLETE' };
  $('' + name + '-status').textContent = labels[run.status] || run.status.replaceAll('_', ' ');
  const last = run.steps?.at(-1);
  $(name + '-result').textContent = run.result?.summary?.split('\n')[0] || run.result?.error ||
    (last ? `${last.tool.replaceAll('_', ' ')}\n${last.result.error || last.result.status || (last.result.waiting ? 'Waiting for inventory. This run resumes automatically.' : 'Tool result recorded in the ledger.')}` : 'Agent is queued…');
  const controls = $(name + '-controls'); controls.replaceChildren();
  const reservation = agents[name].reservation;
  const approvalUrl = reservation?.status === 'PURCHASE_PENDING' ? agents[name].purchaseApproval?.approval_url || (last?.tool === 'request_purchase_approval' ? run.result?.approval_url : null) : run.result?.approval_url;
  if (approvalUrl && (!reservation || ['PENDING_COMMITMENT', 'PURCHASE_PENDING'].includes(reservation.status))) {
    const link = document.createElement('a'); link.href = approvalUrl; link.target = '_blank'; link.rel = 'noopener';
    link.textContent = reservation?.status === 'PURCHASE_PENDING' ? 'Approve purchase in PayPal ↗' : 'Approve commitment in PayPal ↗'; controls.append(link);
  }
  if (reservation) {
    if (reservation.status === 'RESERVED') {
      controls.append(button('Release & apply refund', async () => { await api(`/api/v1/reservations/${reservation.id}/release`, { method: 'POST' }, name); await refresh(); }));
      controls.append(button('Complete booking', async () => {
        const result = await api(`/api/v1/reservations/${reservation.id}/purchase`, { method: 'POST' }, name);
        agents[name].purchaseApproval = result; await loadAgent(name);
      }));
    }
    if (reservation.status === 'PURCHASE_PENDING' && !approvalUrl) controls.append(button('Resume purchase approval', async () => {
      agents[name].purchaseApproval = await api(`/api/v1/reservations/${reservation.id}/purchase`, { method: 'POST' }, name); renderAgent(name, agents[name].run);
    }));
    if (['RESERVED','PURCHASE_PENDING','PURCHASED','EXPIRED','RELEASED'].includes(reservation.status)) {
      const state = document.createElement('span'); state.className = 'badge';
      state.textContent = reservation.status + (reservation.expires_at && reservation.status === 'RESERVED' ? ` · until ${new Date(reservation.expires_at).toLocaleTimeString()}` : ''); controls.append(state);
    }
  }
  if (name === 'a') {
    const state = reservation?.status;
    const statuses = { PENDING_COMMITMENT:'COMMITMENT REQUIRED',RESERVED:'RESERVATION ACTIVE',PURCHASE_PENDING:'FINAL PAYMENT REQUIRED',
      PURCHASED:'BOOKING COMPLETE',RELEASED:'RESOURCE RELEASED',EXPIRED:'HOLD EXPIRED',FAILED:'RESERVATION ENDED' };
    if (state) $('a-status').textContent = statuses[state] || state;
    const texts = {
      PENDING_COMMITMENT:'The agent received your commitment quote. Approve the PayPal Sandbox payment to activate the hold.',
      RESERVED:'PayPal verified the commitment. Your access is exclusive until the deadline. Complete the booking or release the resource.',
      PURCHASE_PENDING:'The final booking is separate from the commitment. Approve its PayPal checkout to complete it.',
      PURCHASED:'PayPal verified the final payment. The booking is complete, and the commitment is settled under its accepted terms.',
      RELEASED:'The resource is available again. Its commitment is settled according to the terms accepted before payment.',
      EXPIRED:'The hold ended automatically. The previous holder can no longer complete this reservation.',
    };
    if (texts[state]) $('a-result').textContent = texts[state];
    if (run.status === 'RUNNING' || run.status === 'QUEUED') $('a-result').textContent = 'The agent is checking availability and the business’s current rules.';
    if (run.status === 'POLICY_DENIED') $('a-result').textContent = run.result?.error === 'COOLDOWN' ? 'This buyer has used its permitted hold. Resaf has blocked another reservation during the cooldown.' : 'The business’s policy denied this request. No new payment was initiated.';
    const stage = state === 'PENDING_COMMITMENT' ? 1 : state === 'RESERVED' ? 2 : ['PURCHASE_PENDING','PURCHASED','RELEASED','EXPIRED','FAILED'].includes(state) ? 3 : 0;
    const commitmentPayment = reservation?.payments?.find(p => ['COMMITMENT_FEE','RESERVATION_AUTHORIZATION'].includes(p.type));
    const finished = ['SETTLED','VOIDED'].includes(commitmentPayment?.status) ||
      (['RELEASED','EXPIRED'].includes(state) && !commitmentPayment?.provider_capture_id && !commitmentPayment?.provider_authorization_id);
    if (['RELEASED','EXPIRED'].includes(state) && !commitmentPayment?.provider_capture_id && !commitmentPayment?.provider_authorization_id) $('a-result').textContent = 'The unpaid claim ended. No commitment payment was collected.';
    if (state === 'PURCHASED' && !finished) $('a-result').textContent = 'The final payment is verified and the booking is complete. The commitment settlement is still processing.';
    ['request','payment','hold','settle'].forEach((step,index) => $("step-"+step).dataset.state = index < stage || (index === 3 && finished) ? 'complete' : index === stage ? 'active' : '');
    $('start-demo').hidden = ['QUEUED','RUNNING','WAITING_FOR_AVAILABILITY'].includes(run.status) || ['PENDING_COMMITMENT','RESERVED','PURCHASE_PENDING','PURCHASED'].includes(state) || (run.status === 'AWAITING_APPROVAL' && !state);
    $('live-proof').hidden = !reservation;
    if (reservation) $('live-response').textContent = JSON.stringify({ reservation: state,
      payment: commitmentPayment?.status || 'NOT_PAID', capture_id: commitmentPayment?.provider_capture_id || undefined,
      refund_id: reservation.payments?.find(p=>p.provider_refund_id)?.provider_refund_id || undefined },null,2);
  }
}
function renderLiveAgent(run) {
  $('agent-live').hidden = false;
  const working = ['QUEUED','RUNNING'].includes(run.status);
  $('agent-working').hidden = !working;
  const steps = run.steps || [];
  $('agent-model').textContent = steps.find(s=>s.model)?.model ? `GEMINI · ${steps.find(s=>s.model).model}` : 'SHOPPING AGENT';
  const labels = { search_resources:'Discover merchant inventory', get_resource:'Check live availability', get_policy:'Read commitment and refund terms', request_reservation:'Request an exclusive claim', start_commitment:'Prepare PayPal commitment', get_reservation_status:'Verify reservation status', release_reservation:'Release the resource', request_purchase_approval:'Request final purchase consent', wait_for_resource:'Wait for inventory to reopen', verified_payment_callback:'Receive verified PayPal result' };
  const list = $('agent-actions');
  const fingerprint=JSON.stringify([steps,working]);
  if (list.dataset.fingerprint === fingerprint) return;
  list.dataset.fingerprint=fingerprint; list.replaceChildren();
  for (const [index, step] of steps.entries()) {
    const li=document.createElement('li'), number=document.createElement('span'), body=document.createElement('div'), detail=document.createElement('small');
    number.textContent=String(index+1).padStart(2,'0'); body.textContent=labels[step.tool] || step.tool.replaceAll('_',' ');
    const r=step.result || {};
    detail.textContent=[r.error || r.status || (r.waiting ? 'Resumes automatically when available' : r.approval_url ? 'Buyer consent required' : r.commitment_amount ? `Commitment ${money(r.commitment_amount, r.currency)}` : 'Backend response received'), new Date(step.occurred_at).toLocaleTimeString()].join(' · ');
    body.append(detail); li.append(number,body); list.append(li);
  }
  if (!steps.length) { const li=document.createElement('li'); li.textContent=working ? 'Waiting for the model’s first tool selection…' : 'No tool calls recorded.'; list.append(li); }
}
async function loadAgent(name) {
  const state = agents[name];
  if (!state.run?.id) return;
  const run = await api(`/api/v1/agents/runs/${state.run.id}`, {}, name);
  const reservationId = run.result?.reservation_id || run.steps?.find(s => s.result?.reservation_id)?.result.reservation_id;
  if (reservationId) state.reservation = await api(`/api/v1/reservations/${reservationId}`, {}, name);
  renderAgent(name, run);
  if (state.reservation?.status === 'PURCHASED') await loadReceipt(reservationId, name);
}
async function refresh() {
  try {
    const [resource, current] = await Promise.all([api(`/api/v1/resources/${RESOURCE_ID}`), api(`/api/v1/resources/${RESOURCE_ID}/policy`)]);
    policy = current;
    $('resource-title').textContent = resource.title; $('resource-price').textContent = money(resource.price);
    $('inventory').textContent = resource.status.replaceAll('_', ' ');
    $('available-at').textContent = resource.available_at ? `until ${new Date(resource.available_at).toLocaleTimeString()}` : 'Merchant inventory';
    $('commitment').textContent = money(policy.commitment_amount); $('policy-version').textContent = `Policy v${policy.version} · ${policy.change_source}`;
    $('duration').textContent = `${policy.hold_duration_seconds / 60} min`;
    $('refund-terms').textContent = `Refunds: ${policy.release_refund_bps / 100}% on release · ${policy.purchase_refund_bps / 100}% after booking · ${policy.expiry_refund_bps / 100}% on expiry`;
    $('automation-status').textContent = policy.automation ? 'AUTOMATIC · WITHIN BUSINESS LIMITS' : 'RULES DISABLED';
    const activity = await api('/api/v1/merchant/activity'); signedIn = true;
    const business = activity.business_decisions?.find(d=>d.resource_id===RESOURCE_ID);
    if (business) $('business-agent-result').textContent = business.status === 'COMPLETED' ? `AI recommended ${business.decision.action}: ${business.decision.explanation} New quote: ${money(business.decision.amount)}.` : business.status === 'FAILED' ? 'AI evaluation unavailable. The previous quote remains in effect.' : 'The business agent is evaluating observed demand…';
    $('login').close(); $('login').hidden = true; $('signout').hidden = false; $('connection').textContent = '● Live';
    decisions = activity.decisions.filter(d => d.resource_id === RESOURCE_ID); renderDecisions();
    for (const name of ['a', 'b']) {
      const run = activity.runs.find(r => r.buyer_id === `buyer-${name}` && (r.objective.includes(RESOURCE_ID) || r.steps?.some(s=>s.arguments?.resource_id === RESOURCE_ID)));
      if (run) agents[name].run = run;
      await loadAgent(name);
    }
  } catch (error) {
    if (error.status === 401) { signedIn = false; $('login').hidden = false; $('connection').textContent = 'Merchant sign-in required'; }
    else { $('connection').textContent = 'Connection interrupted'; notice(error.message); }
  }
  for (const el of document.querySelectorAll('[data-run], [data-check], #automation-form button, #legacy-run')) el.disabled = el.dataset.run ? ['RUNNING','QUEUED'].includes(agents[el.dataset.run]?.run?.status) : !signedIn;
}
$('login-form').onsubmit = async e => {
  e.preventDefault();
  try { await api('/api/demo/session', { method: 'POST', body: JSON.stringify({ key: $('access-key').value }) }); $('access-key').value = ''; $('login').close(); notice(''); await refresh();
    if (afterLoginAgent) { const name=afterLoginAgent; afterLoginAgent=null; document.querySelector(`[data-run="${name}"]`).click(); } }
  catch (error) { $('login-error').textContent = error.message; }
};
$('cancel-login').onclick = () => { afterLoginAgent=null; $('login').close(); };
$('signout').onclick = async () => { await api('/api/demo/session', { method: 'DELETE' }); location.reload(); };
for (const el of document.querySelectorAll('[data-run]')) el.onclick = async () => {
  if (!signedIn) { afterLoginAgent = el.dataset.run; $('login').hidden=false; $('login').showModal(); return; }
  el.disabled = true; const name = el.dataset.run;
  try { notice(''); agents[name].reservation = null;
    const run = await api('/api/v1/agents/runs', { method: 'POST', body: JSON.stringify({ objective: $(name + '-objective').value }) }, name);
    agents[name].run = run; renderAgent(name, run); await refresh();
  } catch (error) { notice(error.message); } finally { el.disabled = false; }
};
for (const el of document.querySelectorAll('[data-check]')) el.onclick = () => loadAgent(el.dataset.check).catch(error => notice(error.message));
function policyInput() {
  return Object.fromEntries(['commitment_amount','currency','payment_mode','hold_duration_seconds','approval_claim_seconds',
    'max_active_holds_per_buyer','repeat_cooldown_seconds','purchase_refund_bps','release_refund_bps','expiry_refund_bps'].map(k => [k, policy[k]]));
}
$('automation-form').onsubmit = async e => {
  e.preventDefault();
  const form = new FormData(e.target);
  const automation = { min_amount: Number(form.get('min_amount')).toFixed(2), max_amount: Number(form.get('max_amount')).toFixed(2),
    step_amount: Number(form.get('step_amount')).toFixed(2), raise_at: Number(form.get('raise_at')), lower_at: Number(form.get('lower_at')),
    window_seconds: Number(form.get('window_minutes')) * 60, cooldown_seconds: Number(form.get('cooldown_minutes')) * 60 };
  try { await api(`/api/v1/resources/${RESOURCE_ID}/policy`, { method: 'POST', body: JSON.stringify({ ...policyInput(), automation }) }); notice('Rules enabled. The next scheduled evaluation adjusts new quotes when its conditions are met.'); await refresh(); }
  catch (error) { notice(error.message); }
};
$('disable-automation').onclick = async () => {
  try { await api(`/api/v1/resources/${RESOURCE_ID}/policy`, { method: 'POST', body: JSON.stringify({ ...policyInput(), automation: null }) }); notice('Automatic adjustment disabled.'); await refresh(); }
  catch (error) { notice(error.message); }
};
$('replay').oninput = () => { live = Number($('replay').value) === decisions.length; renderDecisions(); };
$('go-live').onclick = () => { live = true; renderDecisions(); };
for (const el of document.querySelectorAll('[data-filter]')) el.onclick = () => {
  for (const sibling of document.querySelectorAll('[data-filter]')) sibling.classList.toggle('active', sibling === el);
  grid?.setGridOption('quickFilterText', el.dataset.filter);
};
document.querySelector('script[src*="ag-grid"]').addEventListener('load', configureGrid);
$('trail').addEventListener('toggle', () => { if ($('trail').open) { configureGrid(); renderDecisions(); grid?.sizeColumnsToFit(); } });
configureGrid(); await refresh(); setInterval(refresh, 4000);
let pollingAgent = false;
setInterval(async () => {
  if (pollingAgent || !signedIn) return;
  pollingAgent = true;
  try { for (const name of ['a','b']) if (['QUEUED','RUNNING'].includes(agents[name].run?.status)) await loadAgent(name); }
  catch (error) { notice(error.message); } finally { pollingAgent=false; }
}, 1200);
$('legacy-run').onclick = async () => {
  try {
    const result = await api('/api/demo/legacy-comparison', { method: 'POST', body: JSON.stringify({ resource_id: RESOURCE_ID }) });
    const granted = result.events.filter(e => e.outcome === 'FREE_EXCLUSIVITY_GRANTED').length;
    const blocked = result.events.some(e => e.action === 'FREE_HOLD_BLOCKED');
    $('legacy-result').textContent = `${granted} free holds or renewals granted to A. Client B ${blocked ? 'was blocked' : 'was not blocked'}. Inspect the recorded comparison in the ledger.`;
    await refresh();
  } catch (error) { notice(error.message); }
};
async function loadReceipt(id, buyer) {
  const receipt = await api(`/api/v1/reservations/${id}/receipt`, {}, buyer);
  const box=$('receipt'); box.replaceChildren(); box.hidden=false;
  const label=document.createElement('span'); label.className='eyebrow'; label.textContent='PAYPAL VERIFIED · SANDBOX';
  const heading=document.createElement('h2'); heading.textContent=receipt.document_title;
  const title=document.createElement('p'); title.textContent=receipt.resource;
  const dl=document.createElement('dl');
  for (const [key,value] of [['Merchant',receipt.merchant],['Final payment',money(receipt.amount,receipt.currency)],['Commitment collected',money(receipt.commitment_collected,receipt.currency)],['Commitment returned',money(receipt.commitment_refunded,receipt.currency)],['Settlement',receipt.settlement_status],['Payment ID',receipt.paypal_capture_id],['Confirmation',receipt.reference],['Paid at',new Date(receipt.paid_at).toLocaleString()]]) {
    const dt=document.createElement('dt'), dd=document.createElement('dd'); dt.textContent=key; dd.textContent=value; dl.append(dt,dd);
  }
  const note=document.createElement('p'); note.className='caption'; note.textContent='Sandbox demonstration. This confirms test payment only and is not valid for physical entry or a real booking. Refunds shown above are confirmed; pending settlement updates automatically.';
  box.append(label,heading,title,dl,note,button('Print confirmation',async()=>window.print()));
}
