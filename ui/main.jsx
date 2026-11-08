import React,{useState,useEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {Button,Modal,Badge} from './components/ui.jsx';
import {selectRun,contenderRow} from '../public/agent-state.js';
import {LiveProcess} from './components/live-process.jsx';
import {sceneView,isRoundFinished,quotedTerms} from './scene-state.mjs';
import {demoEntry} from './demo-entry.mjs';
import {Icon} from './components/icon.jsx';
import {EvidenceGrid} from './components/evidence-grid.jsx';

const money=(value,currency='USD')=>new Intl.NumberFormat('en-US',{style:'currency',currency}).format(Number(value));
const active=['QUEUED','RUNNING'];
const initialResource=demoEntry(location.search);
// Consume an explicit payment-return link once. Ordinary reloads start clean.
const entryUrl=new URL(location.href);
entryUrl.searchParams.delete('resource');
history.replaceState(null,'',entryUrl.pathname+entryUrl.search+entryUrl.hash);
localStorage.removeItem('resaf-resource');
const defaultGoal='Secure this parking space and arrange my booking. Read the commitment and refund terms first. Request my PayPal approval for the commitment and the separate final payment.';
const rivalGoal='Try to book the selected resource. Read its policy. If another buyer holds it, wait for availability, then reserve and request payment approval. Respect denials and never claim an unverified payment.';
const labels={search_resources:'Discover inventory',get_resource:'Check availability',get_policy:'Read commitment terms',request_reservation:'Request a claim',start_commitment:'Prepare PayPal commitment',wait_for_resource:'Wait for fair access',get_reservation_status:'Verify the reservation',request_purchase_approval:'Request booking approval',release_reservation:'Release the resource',verified_payment_callback:'Verify PayPal result'};

async function api(path,{buyer,...options}={}) {
  const response=await fetch(path,{signal:AbortSignal.timeout(25000),...options,headers:{'content-type':'application/json',...(buyer?{'X-Demo-Buyer':buyer}:{}),...(options.method==='POST'?{'Idempotency-Key':crypto.randomUUID()}:{}),...options.headers}});
  const data=await response.json();
  if(!response.ok)throw Object.assign(new Error(data.message||data.error||`HTTP ${response.status}`),{status:response.status,code:data.error});
  return data;
}
function DeveloperPage(){
  const [response,setResponse]=useState(null),[busy,setBusy]=useState(false);
  const sample=`curl https://resaf-api.onrender.com/api/v1/reservations \\\n  -H "Authorization: Bearer $RESAF_BUYER_KEY" \\\n  -H "Idempotency-Key: your-unique-request-key" \\\n  -H "Content-Type: application/json" \\\n  -d '{"resource_id":"YOUR_RESOURCE_ID"}'`;
  return <><header className="site-header"><a className="wordmark" href="/">Resaf<span>developer sandbox</span></a><a className="nav-api" href="/">← Live demo</a></header><main className="developer-page"><p className="eyebrow">RESAF · DEVELOPER SANDBOX</p><h1>Connect your business.</h1><p className="subtle">Discover → commit → reserve → settle.</p><section className="api-live-card"><div className="api-endpoint"><Badge tone="good">GET</Badge><code>/api/v1/resources/demo-resource-001</code></div><Button disabled={busy} onClick={async()=>{setBusy(true);try{const started=performance.now();const r=await fetch('/api/v1/resources/demo-resource-001',{signal:AbortSignal.timeout(15000)});const data=await r.json();setResponse({http:r.status,elapsed_ms:Math.round(performance.now()-started),body:data});}catch(error){setResponse({error:error.message});}finally{setBusy(false);}}}>{busy?'Requesting…':'Send live request →'}</Button>{response&&<pre aria-live="polite">{JSON.stringify(response,null,2)}</pre>}</section><section className="api-live-card"><h2>Request a commitment quote</h2><pre>{sample}</pre><p className="fine-print">Use your server-issued buyer key. No payment is captured by this request. The response provides accepted commitment and refund terms.</p></section><div className="api-downloads"><a href="/openapi.yaml">OpenAPI contract ↗</a><a href="https://github.com/agapemiteu/resaf" target="_blank" rel="noopener">Source repository ↗</a></div><section className="api-live-card"><h2 id="payments">Continue the flow</h2>{[['POST','/api/v1/reservations/{id}/commitment','PayPal approval URL'],['POST','/api/v1/reservations/{id}/confirm','Verify payment; activate hold'],['POST','/api/v1/reservations/{id}/release','Release; apply accepted refund'],['POST','/api/v1/reservations/{id}/purchase','Separate final checkout'],['GET','/api/v1/reservations/{id}/receipt','Verified purchase confirmation']].map(([verb,path,result])=><div className="api-route" key={path}><code>{verb} {path}</code><span>{result}</span></div>)}</section><p className="fine-print">Public discovery works without a key. Buyer actions require scoped credentials. Merchant configuration uses a separate merchant key. The public Sandbox demo opens without a key.</p></main></>;
}
function App(){
  const [roundActive,setRoundActive]=useState(initialResource!=='demo-resource-001');
  const [checkoutLinks,setCheckoutLinks]=useState({});
  const [connected,setConnected]=useState(null),[refreshError,setRefreshError]=useState('');
  const [resourceId,setResourceId]=useState(initialResource),[resource,setResource]=useState(null),[policy,setPolicy]=useState(null);
  const [agents,setAgents]=useState({a:{},b:{}}),[activity,setActivity]=useState({decisions:[],alerts:[]}),[signedIn,setSignedIn]=useState(false);
  const [modal,setModal]=useState(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[goal,setGoal]=useState(defaultGoal);
  const [receipt,setReceipt]=useState(null),[evidence,setEvidence]=useState(null),[edgeResult,setEdgeResult]=useState(''),[legacy,setLegacy]=useState('');
  const focus=useRef(resourceId),pinned=useRef({}),refreshing=useRef(false),receiptRef=useRef(null);
  const signedRef=useRef(false),authChecked=useRef(false),activeRound=useRef(initialResource!=='demo-resource-001');
  const rows=['a','b'].map(name=>contenderRow(name,agents[name].run,agents[name].reservation));
  const holder=['a','b'].find(n=>['PENDING_COMMITMENT','RESERVED','PURCHASE_PENDING','PURCHASED'].includes(agents[n].reservation?.status));
  const owner=holder&&agents[holder],reservation=owner?.reservation;
  const running=signedIn&&['a','b'].some(n=>active.includes(agents[n].run?.status));
  const allAlerts=(activity.alerts||[]).filter(a=>a.status==='OPEN');
  const alerts=allAlerts.filter(a=>a.resource_id===resourceId);
  const waiting=['a','b'].filter(n=>agents[n].run?.status==='WAITING_FOR_AVAILABILITY');

  function resetScene({receipt:confirmation=null,message=''}={}){
    activeRound.current=false;focus.current='demo-resource-001';pinned.current={};receiptRef.current=null;
    sessionStorage.removeItem('resaf-active-resource');const cleanUrl=new URL(location.href);cleanUrl.searchParams.delete('resource');history.replaceState(null,'',cleanUrl.pathname+cleanUrl.search+cleanUrl.hash);setRoundActive(false);setResourceId('demo-resource-001');
    setAgents({a:{},b:{}});setReceipt(confirmation);setCheckoutLinks({});setEvidence(null);setEdgeResult('');setNotice(message);
    setActivity({decisions:[],runs:[],alerts:[],business_decisions:[]});
    if(confirmation)setModal('receipt');
  }
  async function refresh(){
    if(refreshing.current)return;refreshing.current=true;const selected=focus.current;
    try{
      const [item,terms]=await Promise.all([api(`/api/v1/resources/${selected}`),api(`/api/v1/resources/${selected}/policy`)]);
      if(focus.current!==selected)return;setResource(item);setPolicy(terms);
      if(!signedRef.current){await api('/api/demo/session',{method:'POST'});signedRef.current=true;setSignedIn(true);}
      if(!activeRound.current){setConnected(true);setRefreshError('');return;}
      let feed;
      try{feed=await api('/api/v1/merchant/activity');authChecked.current=true;}
      catch(error){if(error.status===401){setSignedIn(false);signedRef.current=false;authChecked.current=false;setConnected(true);setRefreshError('');return;}throw error;}
      if(focus.current!==selected)return;setSignedIn(true);signedRef.current=true;
      setActivity(activeRound.current?feed:{...feed,decisions:[],runs:[]});
      if(!activeRound.current){setConnected(true);setRefreshError('');return;}
      const next={a:{},b:{}};
      for(const name of ['a','b']){
        const chosen=selectRun(feed.runs,`buyer-${name}`,selected,pinned.current[name]);
        if(!chosen)continue;
        const run=await api(`/api/v1/agents/runs/${chosen.id}`,{buyer:name});
        const id=run.result?.reservation_id||run.steps?.find(step=>step.result?.reservation_id)?.result.reservation_id;
        const claim=id?await api(`/api/v1/reservations/${id}`,{buyer:name}):null;
        next[name]={run,reservation:claim};pinned.current[name]=run;
      }
      if(focus.current!==selected)return;setAgents(next);setConnected(true);setRefreshError('');
      if(isRoundFinished(next,item)){
        if(item.status==='SOLD'){
          const event=feed.decisions.findLast(d=>d.resource_id===selected&&d.action==='PURCHASE_CAPTURE_CONFIRMED'&&d.evidence?.event?.reservation_id)?.evidence.event;
          const own=Object.entries(next).find(([,agent])=>agent.reservation?.status==='PURCHASED');
          const id=own?.[1].reservation.id||event?.reservation_id,buyer=own?.[0]||(event?.buyer_id==='buyer-b'?'b':'a');
          if(id){const confirmation=await api(`/api/v1/reservations/${id}/receipt`,{buyer});if(focus.current===selected)resetScene({receipt:confirmation});}
          else resetScene({message:'Resource sold.'});
        }else{
          const failed=Object.values(next).some(agent=>['FAILED','LIMIT_REACHED'].includes(agent.run?.status));
          resetScene({message:failed?'Agent paused. You can run again.':'Run finished.'});
        }
      }
    }catch(error){setConnected(false);setRefreshError(error.name==='TimeoutError'?'Connection timed out. Reconnect to check status.':error.message);}
    finally{refreshing.current=false;}
  }
  useEffect(()=>{focus.current=resourceId;if(activeRound.current)sessionStorage.setItem('resaf-active-resource',resourceId);refresh();const interval=setInterval(refresh,1800);return()=>clearInterval(interval);},[resourceId]);
  async function perform(action){
    setBusy(true);setNotice('');try{if(!signedRef.current){await api('/api/demo/session',{method:'POST'});signedRef.current=true;setSignedIn(true);}await action();}catch(error){setNotice(error.message);}finally{setBusy(false);}
  }
  async function launch(name,objective,selected=focus.current){
    const run=await api('/api/v1/agents/runs',{method:'POST',buyer:name,body:JSON.stringify({resource_id:selected,objective})});
    pinned.current[name]=run;setAgents(previous=>({...previous,[name]:{run}}));return run;
  }
  async function race(terms=null){
    let round;
    try {round=await api('/api/demo/rounds',{method:'POST'});}
    catch(error){
      const recover=sessionStorage.getItem('resaf-active-resource');
      if(error.code==='ROUND_BLOCKED'&&recover&&demoEntry('?resource='+encodeURIComponent(recover))===recover){
        focus.current=recover;activeRound.current=true;setRoundActive(true);setResourceId(recover);
        setNotice('An earlier checkout is still open. Finish it or wait for its claim to expire.');
        await refresh();return;
      }
      throw error;
    }
    if(terms){const current=await api(`/api/v1/resources/${round.resource_id}/policy`);const fields=['commitment_amount','currency','payment_mode','hold_duration_seconds','approval_claim_seconds','max_active_holds_per_buyer','repeat_cooldown_seconds','purchase_refund_bps','release_refund_bps','expiry_refund_bps','automation'];const body=Object.fromEntries(fields.map(k=>[k,current[k]]));await api(`/api/v1/resources/${round.resource_id}/policy`,{method:'POST',body:JSON.stringify({...body,...terms})});}
    focus.current=round.resource_id;activeRound.current=true;setRoundActive(true);sessionStorage.setItem('resaf-active-resource',round.resource_id);pinned.current={};receiptRef.current=null;setCheckoutLinks({});
    setReceipt(null);setAgents({a:{},b:{}});setEdgeResult('');setResource(null);setResourceId(round.resource_id);
    const results=await Promise.allSettled([launch('a',goal,round.resource_id),launch('b',rivalGoal,round.resource_id)]);
    for(const result of results)if(result.status==='rejected')setNotice(result.reason.message);
    await refresh();
  }
  async function continueBooking(){await launch(holder,`Continue reservation ${reservation.id} for the selected resource. Check its server status, then request the separate final purchase approval. Do not request another reservation.`);await refresh();}
  async function release(){await api(`/api/v1/reservations/${reservation.id}/release`,{method:'POST',buyer:holder});await refresh();}
  const view=sceneView({roundActive,connected,signedIn,busy,agents,resource});
  const state=reservation?.status,terms=quotedTerms(owner,policy);
  const amount=reservation?.commitment_amount||policy?.commitment_amount;
  const relevantTool=state==='PURCHASE_PENDING'?'request_purchase_approval':'start_commitment';
  const approval=roundActive&&signedIn&&(checkoutLinks[reservation?.id]?.approval_url||owner?.run?.result?.approval_url||owner?.run?.steps?.findLast(step=>step.tool===relevantTool&&step.result?.approval_url)?.result.approval_url);
  async function resumeCheckout(){
    const path=state==='PURCHASE_PENDING'?'purchase':'commitment';
    const result=await api(`/api/v1/reservations/${reservation.id}/${path}`,{method:'POST',buyer:holder});
    setCheckoutLinks(previous=>({...previous,[reservation.id]:result}));
  }
  let onAction=()=>perform(()=>race());
  if(view.phase==='offline')onAction=refresh;
  if(view.phase==='auth')onAction=()=>perform(refresh);
  if(['commitment','purchase'].includes(view.phase)&&!approval)onAction=()=>perform(resumeCheckout);
  if(view.phase==='reserved')onAction=()=>perform(continueBooking);
  const disableAction=connected==null||busy||(!['offline','auth'].includes(view.phase)&&(running||['waiting','settling'].includes(view.phase)));
  const actionLabel=['commitment','purchase'].includes(view.phase)&&!approval?(running?'Preparing checkout...':'Resume checkout'):view.action;
  const canRace=!roundActive;

  return <><header className="site-header"><a href="/" className="wordmark">Resaf</a><div className="header-actions"><a className="nav-api" href="/developers">API</a><Badge>PayPal Sandbox</Badge><Button variant="ghost" size="small" onClick={()=>setModal('business')}>{roundActive&&alerts.length?'Settings - needs attention':'Settings'}</Button></div></header>
    <main><section className="intro"><h1>Reserve. <span className="brand-accent">Commit.</span> Complete.</h1><p className="scope-line">AI reservation agent for businesses. Backed by PayPal.</p></section>
      {(notice||refreshError)&&<div className="notice" role="alert">{notice||refreshError}<Button variant="ghost" size="small" onClick={()=>{setNotice('');setRefreshError('');}}>Dismiss</Button></div>}
      <div className="simulation-layout"><div className="flow-column"><section className="main-card" aria-label="Live reservation demo"><div className="resource-row"><img src="/parking-thumbnail.png" alt="Illustration of a parking space" width="64" height="64"/><div><h2>Parking space P-01</h2><p className="subtle">{money(resource?.price||25)} booking</p></div><Badge>{roundActive?resource?.status?.replaceAll('_',' ')||'Starting':'Sandbox'}</Badge></div>
        <div className="compact-terms terms-metrics"><span><small>Commitment</small><strong>{amount?money(amount):'...'}</strong></span><span><small>Hold</small><strong>{(terms?.hold_duration_seconds||600)/60} min</strong></span><span><small>Refund on booking</small><strong>{terms?terms.purchase_refund_bps/100+'%':'See terms'}</strong></span></div>
        <div className="outcome" aria-live="polite"><h3>{view.title}</h3><div className="primary-actions">{approval&&['commitment','purchase'].includes(view.phase)?<a className="button button-primary" href={approval} target="_blank" rel="noopener">{view.action}<Icon name="external"/></a>:<Button disabled={disableAction} onClick={onAction}><Icon name={view.phase==='ready'?'play':'arrow'}/>{busy?'Starting...':actionLabel}</Button>}{signedIn&&['PENDING_COMMITMENT','RESERVED'].includes(state)&&<Button variant="outline" disabled={busy||running} onClick={()=>perform(release)}>{state==='PENDING_COMMITMENT'?'Cancel':'Release'}</Button>}</div></div>
        <div className="card-links"><Button variant="ghost" onClick={()=>setModal('race')}><Icon name="race"/>Race</Button><Button variant="ghost" onClick={()=>setModal('terms')}><Icon name="terms"/>Terms</Button></div>
      </section></div><LiveProcess key={roundActive?resourceId:'idle'} agents={agents} signedIn={signedIn} connected={connected} onInspect={()=>setModal('race')} onRefresh={refresh} onIssue={()=>setModal('business')} labels={labels}/></div>
      <div className="integration-strip" aria-label="Integrations"><a href="/developers#payments"><strong className="paypal-name">PayPal</strong><small>Commitments</small></a><button onClick={()=>setModal('race')}><strong>AG Grid</strong><small>Live race</small></button><a href="/health" target="_blank" rel="noopener"><strong>Render</strong><small>Hosting + database</small></a></div>
      <footer><button onClick={()=>setModal('why')}>About Resaf</button><a href="/developers">API playground</a><span>PayPal Sandbox</span></footer>
    </main>
    <Modal open={modal==='terms'} onOpenChange={open=>!open&&setModal(null)} title="Reservation terms" description={reservation?'Accepted for this reservation.':'Applied before payment.'}><dl className="terms-list">{[['Commitment',amount?money(amount):'Loading'],['Hold',`${(terms?.hold_duration_seconds||600)/60} minutes`],['Refund after booking',terms?`${terms.purchase_refund_bps/100}%`:'Loading'],['Refund on release',terms?`${terms.release_refund_bps/100}%`:'Loading'],['Refund on expiry',terms?`${terms.expiry_refund_bps/100}%`:'Loading']].map(([label,value])=><React.Fragment key={label}><dt>{label}</dt><dd>{value}</dd></React.Fragment>)}</dl><p className="fine-print">Refund percentages apply to the commitment. The final booking is a separate payment.</p></Modal>
    <Modal open={modal==='setup'} onOpenChange={open=>!open&&setModal(null)} title="Reservation settings" description="Applied before payment."><form onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);const terms={commitment_amount:Number(data.get('fee')).toFixed(2),hold_duration_seconds:Number(data.get('minutes'))*60,purchase_refund_bps:Number(data.get('refund'))*100};setModal(null);perform(()=>race(terms));}}><div className="two-fields"><label>Commitment fee $<input name="fee" type="number" min="1" max="5" step="0.01" defaultValue={policy?.commitment_amount||'2.00'} required/></label><label>Fixed hold (minutes)<input name="minutes" type="number" min="1" max="60" defaultValue={(policy?.hold_duration_seconds||600)/60} required/></label></div><label>Commitment returned after purchase (%)<input name="refund" type="number" min="0" max="100" step="1" defaultValue={(policy?.purchase_refund_bps??10000)/100} required/></label><Button type="submit">Run</Button></form></Modal>
    <Modal open={modal==='race'} onOpenChange={open=>!open&&setModal(null)} title="Reservation race" description="One unit." wide><EvidenceGrid rows={rows} onSelect={setEvidence} connected={connected}/>{evidence&&<details open><summary>Request details</summary><pre>{JSON.stringify(evidence,null,2)}</pre></details>}<Button size="small" variant="ghost" onClick={()=>setModal('cases')}>Test failures</Button><details><summary>Event ledger</summary><EvidenceGrid type="ledger" rows={activity.decisions.filter(d=>d.resource_id===resourceId)} onSelect={setEvidence}/></details></Modal>
    <Modal open={modal==='goal'} onOpenChange={open=>!open&&setModal(null)} title="Give the agent a goal" description="The two agents receive independent missions. The backend enforces the business’s accepted financial terms."><label>Your agent’s objective<textarea rows="4" value={goal} onChange={event=>setGoal(event.target.value)}/></label><Button onClick={()=>setModal(null)}>Save mission</Button><p className="fine-print">Applies to the next fresh round. Existing payment consent remains unchanged.</p></Modal>
    <Modal open={modal==='receipt'} onOpenChange={open=>{if(!open){setModal(null);setReceipt(null);}}} title="Booking confirmed" description="PayPal verified.">{receipt&&<div className="receipt"><Badge tone="good">PayPal verified · Sandbox</Badge><h3>{receipt.resource}</h3><dl>{[['Final booking paid',money(receipt.amount)],['Commitment collected',money(receipt.commitment_collected)],['Commitment returned',money(receipt.commitment_refunded)],['Settlement',receipt.settlement_status],['PayPal payment',receipt.paypal_capture_id],['Confirmation',receipt.reference]].map(([key,value])=><React.Fragment key={key}><dt>{key}</dt><dd>{value}</dd></React.Fragment>)}</dl><p className="fine-print">Test money and demonstration inventory. Not valid for physical entry or a real booking.</p><div className="primary-actions"><Button onClick={()=>{setModal(null);setReceipt(null);}}>Done</Button><Button variant="ghost" onClick={()=>window.print()}>Print</Button></div></div>}</Modal>
    <Modal open={modal==='cases'} onOpenChange={open=>!open&&setModal(null)} title="Test the boundaries" description="These tests exercise real reservation endpoints. They do not invent declined payments or refunds."><div className="case-options"><Button variant="outline" disabled={!reservation} onClick={()=>perform(async()=>{try{await api(`/api/v1/reservations/${reservation.id}`,{buyer:holder==='a'?'b':'a'});setEdgeResult('Unexpected access: inspect the business records.');}catch(error){if(error.status!==404)throw error;setEdgeResult('404 — the competing buyer cannot access the holder’s reservation. The claim remains with its owner.');}})}>A different buyer accesses the claim</Button><Button variant="outline" disabled={!reservation} onClick={()=>perform(async()=>{try{await api('/api/v1/reservations',{method:'POST',buyer:holder,body:JSON.stringify({resource_id:resourceId})});setEdgeResult('The backend granted a claim; inspect the recorded state.');}catch(error){if(error.status!==409)throw error;setEdgeResult(`409 — ${error.message} No new payment was initiated.`);}})}>The holder tries a repeated claim</Button><Button variant="outline" disabled={!canRace||running} onClick={()=>perform(async()=>{setModal(null);await race();})}>Two agents request the same unit</Button><Button variant="outline" onClick={()=>perform(async()=>{const drill=await api('/api/demo/failure-drill',{method:'POST',body:JSON.stringify({resource_id:resourceId})});setEdgeResult(`${drill.status}: simulated transport timeout. No PayPal request was sent. A business attention record was created.`);await refresh();})}>Simulate a transport failure &amp; handoff</Button></div><p role="status">{edgeResult||'Start a live round to test its actual claim.'}</p><p className="fine-print">Model or tool failure stops the run and creates a business attention record. Availability conflicts make the losing agent wait; sold inventory makes it stop.</p></Modal>
    <Modal open={modal==='business'} onOpenChange={open=>!open&&setModal(null)} title="Settings" description="New quotes can adapt within your limits. Accepted prices and refund promises remain fixed."><Button variant="outline" disabled={roundActive} onClick={()=>setModal('setup')}><Icon name="settings"/>Reservation terms</Button><div className="business-attention"><Badge tone={allAlerts.length?'warning':'good'}>{allAlerts.length?`${allAlerts.length} needs attention`:'No unresolved agent failures'}</Badge>{allAlerts.map(alert=><div key={alert.id}><p>{alert.message}</p><Button size="small" variant="outline" onClick={()=>perform(async()=>{await api(`/api/v1/merchant/alerts/${alert.id}/acknowledge`,{method:'POST'});await refresh();})}>Mark reviewed</Button></div>)}</div><details><summary>Automatic commitment pricing</summary><p className="fine-print">The business AI observes real demand, then recommends raise, lower, or keep. Code enforces the conditions and bounds.</p><form onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);perform(async()=>{const fields=['commitment_amount','currency','payment_mode','hold_duration_seconds','approval_claim_seconds','max_active_holds_per_buyer','repeat_cooldown_seconds','purchase_refund_bps','release_refund_bps','expiry_refund_bps'];const body=Object.fromEntries(fields.map(k=>[k,policy[k]]));body.automation={min_amount:Number(data.get('min')).toFixed(2),max_amount:Number(data.get('max')).toFixed(2),step_amount:'0.50',raise_at:3,lower_at:0,window_seconds:3600,cooldown_seconds:300};await api(`/api/v1/resources/${resourceId}/policy`,{method:'POST',body:JSON.stringify(body)});await refresh();setNotice('Business agent enabled within these limits.');});}}><div className="two-fields"><label>Minimum $<input name="min" type="number" min="0.01" step="0.01" defaultValue={policy?.automation?.min_amount||'1.00'} required/></label><label>Maximum $<input name="max" type="number" min="0.01" step="0.01" defaultValue={policy?.automation?.max_amount||'5.00'} required/></label></div><Button type="submit" disabled={busy||!roundActive}>{roundActive?'Enable business agent':'Start a run first'}</Button></form>{activity.business_decisions?.filter(d=>d.resource_id===resourceId).slice(0,1).map(d=><p key={d.id}>{d.status==='COMPLETED'?`${d.decision.action}: ${d.decision.explanation}`:'Evaluation pending or unavailable; previous quote preserved.'}</p>)}</details><p className="fine-print">Handoffs are recorded here for the business. No email or external notification is sent.</p></Modal>
    <Modal open={modal==='why'} onOpenChange={open=>!open&&setModal(null)} title="A hold should mean something." description="Without commitment, an agent can keep renewing free holds while another buyer is blocked."><p>Resaf is an AI reservation agent for businesses. A verified PayPal commitment unlocks the paid reservation. Your rules set the deadline and refund; Resaf enforces access and verifies PayPal settlement.</p><Button variant="outline" onClick={()=>perform(async()=>{const result=await api('/api/demo/legacy-comparison',{method:'POST',body:JSON.stringify({resource_id:resourceId})});setLegacy(`${result.events.filter(e=>e.outcome==='FREE_EXCLUSIVITY_GRANTED').length} free holds or renewals granted; another buyer was blocked.`);})}>Run the unprotected comparison</Button><p>{legacy}</p><p className="fine-print">Separate, persisted scripted comparison. No PayPal payment and no change to the protected inventory.</p></Modal>
  </>;
}
class ErrorBoundary extends React.Component{state={error:null};static getDerivedStateFromError(error){return {error};}render(){return this.state.error?<main><h1>The demo needs a refresh.</h1><p>The interface stopped safely. Existing payments remain recorded.</p><button onClick={()=>location.reload()}>Reload live state</button></main>:this.props.children;}}
createRoot(document.getElementById('root')).render(<ErrorBoundary>{location.pathname==='/developers'?<DeveloperPage/>:<App/>}</ErrorBoundary>);
