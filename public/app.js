const $ = id => document.getElementById(id);
let signedIn = false, policy, grid, decisions = [], live = true;
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
  if (!window.agGrid) {
    $('decision-grid').hidden = true; $('grid-fallback').hidden = false;
    $('grid-fallback').textContent = 'AG Grid could not load. API evidence remains available below.';
    return;
  }
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
  $('' + name + '-status').textContent = run.status.replaceAll('_', ' ');
  const last = run.steps?.at(-1);
  $(name + '-result').textContent = run.result?.summary || run.result?.error ||
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
      controls.append(button('Release reservation', async () => { await api(`/api/v1/reservations/${reservation.id}/release`, { method: 'POST' }, name); await refresh(); }));
      controls.append(button('Request final purchase', async () => {
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
}
async function loadAgent(name) {
  const state = agents[name];
  if (!state.run?.id) return;
  const run = await api(`/api/v1/agents/runs/${state.run.id}`, {}, name);
  const reservationId = run.result?.reservation_id || run.steps?.find(s => s.result?.reservation_id)?.result.reservation_id;
  if (reservationId) state.reservation = await api(`/api/v1/reservations/${reservationId}`, {}, name);
  renderAgent(name, run);
}
async function refresh() {
  try {
    const [resource, current] = await Promise.all([api('/api/v1/resources/bag-001'), api('/api/v1/resources/bag-001/policy')]);
    policy = current;
    $('resource-title').textContent = resource.title; $('resource-price').textContent = money(resource.price);
    $('inventory').textContent = resource.status.replaceAll('_', ' ');
    $('available-at').textContent = resource.available_at ? `until ${new Date(resource.available_at).toLocaleTimeString()}` : 'Merchant inventory';
    $('commitment').textContent = money(policy.commitment_amount); $('policy-version').textContent = `Policy v${policy.version} · ${policy.change_source}`;
    $('duration').textContent = `${policy.hold_duration_seconds / 60} min`;
    $('refund-terms').textContent = `${policy.release_refund_bps / 100}% release · ${policy.purchase_refund_bps / 100}% purchase refund`;
    $('automation-status').textContent = policy.automation ? 'AUTOMATIC · WITHIN BUSINESS LIMITS' : 'RULES DISABLED';
    const activity = await api('/api/v1/merchant/activity'); signedIn = true;
    $('login').hidden = true; $('signout').hidden = false; $('connection').textContent = '● Live connection';
    decisions = activity.decisions; renderDecisions();
    for (const name of ['a', 'b']) {
      const run = activity.runs.find(r => r.buyer_id === `buyer-${name}`);
      if (run) agents[name].run = run;
      await loadAgent(name);
    }
  } catch (error) {
    if (error.status === 401) { signedIn = false; $('login').hidden = false; $('connection').textContent = 'Merchant sign-in required'; }
    else { $('connection').textContent = 'Connection interrupted'; notice(error.message); }
  }
  for (const el of document.querySelectorAll('[data-run], [data-check], #automation-form button')) el.disabled = !signedIn;
}
$('login-form').onsubmit = async e => {
  e.preventDefault();
  try { await api('/api/demo/session', { method: 'POST', body: JSON.stringify({ key: $('access-key').value }) }); $('access-key').value = ''; notice(''); await refresh(); }
  catch (error) { notice(error.message); }
};
$('signout').onclick = async () => { await api('/api/demo/session', { method: 'DELETE' }); location.reload(); };
for (const el of document.querySelectorAll('[data-run]')) el.onclick = async () => {
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
  try { await api('/api/v1/resources/bag-001/policy', { method: 'POST', body: JSON.stringify({ ...policyInput(), automation }) }); notice('Rules enabled. The next scheduled evaluation adjusts new quotes when its conditions are met.'); await refresh(); }
  catch (error) { notice(error.message); }
};
$('disable-automation').onclick = async () => {
  try { await api('/api/v1/resources/bag-001/policy', { method: 'POST', body: JSON.stringify({ ...policyInput(), automation: null }) }); notice('Automatic adjustment disabled.'); await refresh(); }
  catch (error) { notice(error.message); }
};
$('replay').oninput = () => { live = Number($('replay').value) === decisions.length; renderDecisions(); };
$('go-live').onclick = () => { live = true; renderDecisions(); };
for (const el of document.querySelectorAll('[data-filter]')) el.onclick = () => {
  for (const sibling of document.querySelectorAll('[data-filter]')) sibling.classList.toggle('active', sibling === el);
  grid?.setGridOption('quickFilterText', el.dataset.filter);
};
configureGrid(); await refresh(); setInterval(refresh, 4000);
