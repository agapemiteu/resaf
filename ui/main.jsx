import React,{useState,useEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {Button,Modal,Badge} from './components/ui.jsx';
import {selectRun,contenderRow} from '../public/agent-state.js';

const money=(value,currency='USD')=>new Intl.NumberFormat('en-US',{style:'currency',currency}).format(Number(value));
const active=['QUEUED','RUNNING'];
const initialResource=/^[a-zA-Z0-9-]{1,64}$/.test(localStorage.getItem('resaf-resource')||'')?localStorage.getItem('resaf-resource'):'demo-resource-001';
const defaultGoal='Secure this parking space and arrange my booking. Read the commitment and refund terms first. Request my PayPal approval for the commitment and the separate final payment.';
const rivalGoal='Try to book the selected resource. Read its policy. If another buyer holds it, wait for availability, then reserve and request payment approval. Respect denials and never claim an unverified payment.';
const labels={search_resources:'Discover inventory',get_resource:'Check availability',get_policy:'Read commitment terms',request_reservation:'Request a claim',start_commitment:'Prepare PayPal commitment',wait_for_resource:'Wait for fair access',get_reservation_status:'Verify the reservation',request_purchase_approval:'Request booking approval',release_reservation:'Release the resource',verified_payment_callback:'Verify PayPal result'};

async function api(path,{buyer,...options}={}) {
  const response=await fetch(path,{signal:AbortSignal.timeout(25000),...options,headers:{'content-type':'application/json',...(buyer?{'X-Demo-Buyer':buyer}:{}),...(options.method==='POST'?{'Idempotency-Key':crypto.randomUUID()}:{}),...options.headers}});
  const data=await response.json();
  if(!response.ok)throw Object.assign(new Error(data.message||data.error||`HTTP ${response.status}`),{status:response.status,code:data.error});
  return data;
}
function EvidenceGrid({rows,type='race',onSelect}) {
  const container=useRef(null),grid=useRef(null),[ready,setReady]=useState(!!window.agGrid);
  useEffect(()=>{const loaded=()=>setReady(true);window.addEventListener('ag-grid-ready',loaded);return()=>window.removeEventListener('ag-grid-ready',loaded);},[]);
  useEffect(()=>{
    if(!ready||!container.current)return;
    grid.current=window.agGrid.createGrid(container.current,{
      theme:window.agGrid.themeQuartz.withParams({fontFamily:'Inter,system-ui,sans-serif',fontSize:12,headerFontSize:10,borderColor:'#e7e8eb',accentColor:'#1f664b'}),
      columnDefs:type==='race'?[{field:'actor',headerName:'CONTENDER',width:110},{field:'ownership',headerName:'ACCESS',width:175},{field:'outcome',headerName:'BACKEND RESULT',width:195},{field:'next',headerName:'NEXT ACTION',flex:1,minWidth:225}]:
        [{field:'actor',headerName:'ACTOR',width:110},{field:'action',headerName:'ACTION',flex:1,minWidth:210},{field:'outcome',headerName:'RESULT',flex:1,minWidth:220}],
      defaultColDef:{resizable:true,sortable:true},getRowId:p=>p.data.id,rowHeight:48,headerHeight:36,animateRows:true,
      rowClassRules:{'row-winner':p=>p.data.ownership&&p.data.ownership!=='NO CLAIM','row-waiting':p=>p.data.waiting,'row-failed':p=>['FAILED','RESOURCE_SOLD','POLICY_DENIED'].includes(p.data.outcome)},
      onRowClicked:p=>onSelect?.(p.data.evidence),rowData:rows,
    });return()=>{grid.current?.destroy();grid.current=null;};
  },[ready,type]);
  useEffect(()=>{grid.current?.setGridOption('rowData',rows);},[rows]);
  return ready?<div ref={container} className={`evidence-grid ${type==='race'?'race-grid':''}`}/>:<div className="table-fallback">{rows.map(row=><p key={row.id}><strong>{row.actor}</strong> · {row.ownership||row.action} · {row.outcome}</p>)}</div>;
}
function App(){
  const [resourceId,setResourceId]=useState(initialResource),[resource,setResource]=useState(null),[policy,setPolicy]=useState(null);
  const [agents,setAgents]=useState({a:{},b:{}}),[activity,setActivity]=useState({decisions:[],alerts:[]}),[signedIn,setSignedIn]=useState(false);
  const [modal,setModal]=useState(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[goal,setGoal]=useState(defaultGoal);
  const [receipt,setReceipt]=useState(null),[evidence,setEvidence]=useState(null),[edgeResult,setEdgeResult]=useState(''),[legacy,setLegacy]=useState('');
  const focus=useRef(resourceId),pinned=useRef({}),refreshing=useRef(false),pendingAction=useRef(null),receiptRef=useRef(null);
  const signedRef=useRef(false),authChecked=useRef(false);
  const rows=['a','b'].map(name=>contenderRow(name,agents[name].run,agents[name].reservation));
  const holder=['a','b'].find(n=>['PENDING_COMMITMENT','RESERVED','PURCHASE_PENDING','PURCHASED'].includes(agents[n].reservation?.status));
  const owner=holder&&agents[holder],reservation=owner?.reservation;
  const running=['a','b'].some(n=>active.includes(agents[n].run?.status));
  const allAlerts=(activity.alerts||[]).filter(a=>a.status==='OPEN');
  const alerts=allAlerts.filter(a=>a.resource_id===resourceId);
  const waiting=['a','b'].filter(n=>agents[n].run?.status==='WAITING_FOR_AVAILABILITY');

  async function refresh(){
    if(refreshing.current)return;refreshing.current=true;const selected=focus.current;
    try{
      const [item,terms]=await Promise.all([api(`/api/v1/resources/${selected}`),api(`/api/v1/resources/${selected}/policy`)]);
      if(focus.current!==selected)return;setResource(item);setPolicy(terms);
      if(authChecked.current&&!signedRef.current)return;
      let feed;
      try{feed=await api('/api/v1/merchant/activity');authChecked.current=true;}
      catch(error){if(error.status===401){setSignedIn(false);signedRef.current=false;authChecked.current=true;return;}throw error;}
      if(focus.current!==selected)return;setSignedIn(true);signedRef.current=true;setActivity(feed);
      const next={a:{},b:{}};
      for(const name of ['a','b']){
        const chosen=selectRun(feed.runs,`buyer-${name}`,selected,pinned.current[name]);
        if(!chosen)continue;
        const run=await api(`/api/v1/agents/runs/${chosen.id}`,{buyer:name});
        const id=run.result?.reservation_id||run.steps?.find(s=>s.result?.reservation_id)?.result.reservation_id;
        const claim=id?await api(`/api/v1/reservations/${id}`,{buyer:name}):null;
        next[name]={run,reservation:claim};pinned.current[name]=run;
      }
      if(focus.current!==selected)return;setAgents(next);
      const purchase=feed.decisions.findLast(d=>d.resource_id===selected&&d.action==='PURCHASE_CAPTURE_CONFIRMED'&&d.evidence?.event?.reservation_id);
      if(purchase){
        const id=purchase.evidence.event.reservation_id;
        if(receiptRef.current!==id){const data=await api(`/api/v1/reservations/${id}/receipt`,{buyer:purchase.evidence.event.buyer_id==='buyer-b'?'b':'a'});if(focus.current===selected){setReceipt(data);receiptRef.current=id;}}
      }
    }catch(error){setNotice(error.name==='TimeoutError'?'The server is taking longer than expected. The next refresh will check the recorded outcome.':error.message);}
    finally{refreshing.current=false;}
  }
  useEffect(()=>{focus.current=resourceId;localStorage.setItem('resaf-resource',resourceId);refresh();const interval=setInterval(refresh,1800);return()=>clearInterval(interval);},[resourceId]);
  async function perform(action){
    if(!signedRef.current){pendingAction.current=action;setModal('login');return;}
    setBusy(true);setNotice('');try{await action();}catch(error){setNotice(error.message);}finally{setBusy(false);}
  }
  async function launch(name,objective,selected=focus.current){
    const run=await api('/api/v1/agents/runs',{method:'POST',buyer:name,body:JSON.stringify({resource_id:selected,objective})});
    pinned.current[name]=run;setAgents(previous=>({...previous,[name]:{run}}));return run;
  }
  async function race(){
    const round=await api('/api/demo/rounds',{method:'POST'});
    focus.current=round.resource_id;pinned.current={};receiptRef.current=null;
    setReceipt(null);setAgents({a:{},b:{}});setEdgeResult('');setResource(null);setResourceId(round.resource_id);
    const results=await Promise.allSettled([launch('a',goal,round.resource_id),launch('b',rivalGoal,round.resource_id)]);
    for(const result of results)if(result.status==='rejected')setNotice(result.reason.message);
    await refresh();
  }
  async function continueBooking(){await launch(holder,`Continue reservation ${reservation.id} for the selected resource. Check its server status, then request the separate final purchase approval. Do not request another reservation.`);await refresh();}
  async function release(){await api(`/api/v1/reservations/${reservation.id}/release`,{method:'POST',buyer:holder});await refresh();}
  let title='Two agents. One parking space.',description='One gets a provisional claim. PayPal commitment activates exclusive access. The other waits for a fair opportunity.',action='Run fair-access demo',onAction=()=>perform(race),approval=null;
  const state=reservation?.status;
  if(resource?.status==='SOLD'){title=receipt?'Booked. Commitment settled.':'This round is complete.';description=receipt?`${money(receipt.amount)} booking verified. ${money(receipt.commitment_refunded)} commitment refunded through PayPal.`:'This round is sold. Its verified receipt is available; a fresh round preserves the previous transactions.';action='Start a fresh round';}
  else if(running){title='The agents are making their moves.';description='Checking real inventory, reading terms, and choosing their next tools.';action='Agents working…';}
  if(state==='PENDING_COMMITMENT'){title=`Agent ${holder.toUpperCase()} reached the first claim.`;description='No exclusive paid hold yet. Approve the quoted PayPal commitment to activate it.';action='Approve commitment';approval=owner.run?.result?.approval_url;}
  if(state==='RESERVED'){title=`Agent ${holder.toUpperCase()} has verified exclusivity.`;description='PayPal confirmed the commitment. The booking agent continues; the competing buyer waits.';action='Ask agent to complete booking';onAction=()=>perform(continueBooking);}
  if(state==='PURCHASE_PENDING'){title='The agent is ready to book.';description='The commitment and final booking are separate payments. Approve the final checkout to complete this round.';action='Approve final booking';approval=owner.run?.result?.approval_url;}
  if(state==='PURCHASED'){title='Booked. A fair outcome.';description=receipt?`${money(receipt.amount)} booking paid. ${money(receipt.commitment_refunded)} commitment returned.`:'Final payment verified. Commitment settlement follows the accepted terms.';action='Start a fresh round';onAction=()=>perform(race);}
  if(alerts.length&&!reservation&&!running){title='The agent stopped safely.';description='The business has an attention record. No payment success was assumed.';action='Review the issue';onAction=()=>setModal('business');}
  const canRace=!['PENDING_COMMITMENT','RESERVED','PURCHASE_PENDING'].includes(state)&&!['APPROVAL_PENDING','RESERVED','PURCHASE_PENDING'].includes(resource?.status);

  return <><header className="site-header"><a href="/" className="wordmark">resaf<span>reserve + safe</span></a><div className="header-actions"><Badge>PayPal Sandbox</Badge><Button variant="ghost" size="small" onClick={()=>signedIn?setModal('business'):setModal('login')}>{alerts.length?'Business · needs attention':signedIn?'Business':'Sign in'}</Button></div></header>
    <main><section className="intro"><p className="eyebrow">FAIR ACCESS FOR AGENTIC COMMERCE</p><h1>Let agents reserve.<br/>Keep the opportunity open.</h1><p>Free, repeated holds can lock real buyers out. Resaf adds a PayPal-backed commitment, with refunds set by the business.</p><p className="scope-line">One reservation API for parking, rooms, tables, and scarce inventory.</p></section>
      {notice&&<div className="notice" role="alert">{notice}<Button variant="ghost" size="small" onClick={()=>setNotice('')}>Dismiss</Button></div>}
      <section className="main-card" aria-label="Live fair-access demonstration"><div className="resource-row"><img src="/parking-thumbnail.png" alt="Illustration of a parking space" width="64" height="64"/><div><p className="eyebrow">EXAMPLE MERCHANT RESOURCE</p><h2>{resource?.title||'Parking space P-01'}</h2><p className="subtle">{resource?money(resource.price):'…'} final booking · one unit</p></div><Badge tone={resource?.status==='AVAILABLE'?'good':'neutral'}>{resource?.status?.replaceAll('_',' ')||'Connecting'}</Badge></div>
        <div className="compact-terms"><span><strong>{policy?money(policy.commitment_amount):'…'}</strong> commitment</span><span>{policy?.hold_duration_seconds/60||10} min hold</span><span>{(policy?.purchase_refund_bps??10000)/100}% of commitment back after purchase</span></div>
        <div className="outcome" aria-live="polite"><div className="status-line"><span className={running?'live-dot pulse':'live-dot'}/>{running?'Live AI actions':state==='PURCHASED'||resource?.status==='SOLD'?'Verified outcome':'Live Sandbox scenario'}{waiting.length>0&&<span className="waiting-summary">{waiting.length} competing agent waiting</span>}</div><h3>{title}</h3><p>{description}</p>{Object.values(agents).some(a=>a.run?.steps?.length>0)&&<p className="latest-moves">{['a','b'].filter(n=>agents[n].run?.steps?.length).map(n=>`Agent ${n.toUpperCase()}: ${labels[agents[n].run.steps.at(-1).tool]||agents[n].run.steps.at(-1).tool}`).join(' / ')}</p>}
          <div className="primary-actions">{approval?<a className="button button-primary" href={approval} target="_blank" rel="noopener">{action} ↗</a>:<Button disabled={busy||running||(!approval&&state==='PENDING_COMMITMENT')} onClick={onAction}>{busy?'Starting…':action}<span aria-hidden="true">→</span></Button>}
          {receipt&&<Button variant="outline" onClick={()=>setModal('receipt')}>View confirmation</Button>}{state==='RESERVED'&&<Button variant="ghost" onClick={()=>perform(release)}>Release & apply refund</Button>}</div>
          {policy&&<p className="fine-print">Commitment refunds: {policy.release_refund_bps/100}% on early release · {policy.expiry_refund_bps/100}% on expiry. PayPal approval is required for each demo checkout.</p>}
        </div><div className="card-links"><Button variant="ghost" onClick={()=>setModal('race')}>See the race <span>{Object.values(agents).filter(a=>a.run).length||''}</span></Button><Button variant="ghost" onClick={()=>setModal('cases')}>Try an edge case</Button><Button variant="ghost" onClick={()=>setModal('goal')}>Edit the mission</Button></div>
      </section><p className="principle">Information is free. Scarcity isn’t.</p><footer><button onClick={()=>setModal('why')}>Why this matters</button><a href="/openapi.yaml" target="_blank" rel="noopener">Developer API ↗</a><span>PayPal · Render · AG Grid</span></footer>
    </main>
    <Modal open={modal==='login'} onOpenChange={open=>!open&&setModal(null)} title="Open the live Sandbox" description="Sign in once to control the two demonstration buyers. No credentials are shared with the AI."><form onSubmit={async event=>{event.preventDefault();const key=new FormData(event.currentTarget).get('key');setBusy(true);try{await api('/api/demo/session',{method:'POST',body:JSON.stringify({key})});signedRef.current=true;setSignedIn(true);setModal(null);await refresh();const next=pendingAction.current;pendingAction.current=null;if(next)await next();}catch(error){setNotice(error.message);}finally{setBusy(false);}}}><label>Merchant key<input name="key" type="password" autoComplete="off" required placeholder="MERCHANT_API_KEY from .env.local"/></label><Button type="submit" disabled={busy}>{busy?'Opening…':'Continue'}</Button></form></Modal>
    <Modal open={modal==='race'} onOpenChange={open=>!open&&setModal(null)} title="One resource. Two independent agents." description="Actual model decisions and backend outcomes. Green means a claim was obtained; a provisional claim still requires PayPal commitment." wide><EvidenceGrid rows={rows} onSelect={setEvidence}/><p className="fine-print">Live contention view powered by AG Grid Community.</p>{['a','b'].map(name=><details key={name}><summary>Agent {name.toUpperCase()} · {agents[name].run?.status?.replaceAll('_',' ')||'not started'}</summary><ol className="tool-list">{agents[name].run?.steps?.map((step,index)=><li key={index}><span>{labels[step.tool]||step.tool}</span><small>{step.result?.error||step.result?.status||'Backend result recorded'} · {step.model||'Verified callback'}</small></li>)}</ol>{agents[name].run?.result?.error&&<p className="error-copy">{agents[name].run.result.error}</p>}</details>)}{evidence&&<details open><summary>Selected backend evidence</summary><pre>{JSON.stringify(evidence,null,2)}</pre></details>}<details><summary>PayPal & policy history</summary><EvidenceGrid type="ledger" rows={activity.decisions.filter(d=>d.resource_id===resourceId)} onSelect={setEvidence}/></details></Modal>
    <Modal open={modal==='goal'} onOpenChange={open=>!open&&setModal(null)} title="Give the agent a goal" description="The two agents receive independent missions. The backend enforces the business’s accepted financial terms."><label>Your agent’s objective<textarea rows="4" value={goal} onChange={event=>setGoal(event.target.value)}/></label><Button onClick={()=>setModal(null)}>Save mission</Button><p className="fine-print">Applies to the next fresh round. Existing payment consent remains unchanged.</p></Modal>
    <Modal open={modal==='receipt'} onOpenChange={open=>!open&&setModal(null)} title={receipt?.document_title||'Payment confirmation'} description="Issued only after server verification of the actual PayPal purchase capture.">{receipt&&<div className="receipt"><Badge tone="good">PayPal verified · Sandbox</Badge><h3>{receipt.resource}</h3><dl>{[['Final booking paid',money(receipt.amount)],['Commitment collected',money(receipt.commitment_collected)],['Commitment returned',money(receipt.commitment_refunded)],['Settlement',receipt.settlement_status],['PayPal payment',receipt.paypal_capture_id],['Confirmation',receipt.reference]].map(([key,value])=><React.Fragment key={key}><dt>{key}</dt><dd>{value}</dd></React.Fragment>)}</dl><p className="fine-print">Test money and demonstration inventory. Not valid for physical entry or a real booking.</p><Button variant="outline" onClick={()=>window.print()}>Print confirmation</Button></div>}</Modal>
    <Modal open={modal==='cases'} onOpenChange={open=>!open&&setModal(null)} title="Test the boundaries" description="These tests exercise real reservation endpoints. They do not invent declined payments or refunds."><div className="case-options"><Button variant="outline" disabled={!reservation} onClick={()=>perform(async()=>{try{await api(`/api/v1/reservations/${reservation.id}`,{buyer:holder==='a'?'b':'a'});setEdgeResult('Unexpected access: inspect the business records.');}catch(error){if(error.status!==404)throw error;setEdgeResult('404 — the competing buyer cannot access the holder’s reservation. The claim remains with its owner.');}})}>A different buyer accesses the claim</Button><Button variant="outline" disabled={!reservation} onClick={()=>perform(async()=>{try{await api('/api/v1/reservations',{method:'POST',buyer:holder,body:JSON.stringify({resource_id:resourceId})});setEdgeResult('The backend granted a claim; inspect the recorded state.');}catch(error){if(error.status!==409)throw error;setEdgeResult(`409 — ${error.message} No new payment was initiated.`);}})}>The holder tries a repeated claim</Button><Button variant="outline" disabled={!canRace||running} onClick={()=>perform(async()=>{setModal(null);await race();})}>Two agents request the same unit</Button><Button variant="outline" onClick={()=>perform(async()=>{const drill=await api('/api/demo/failure-drill',{method:'POST',body:JSON.stringify({resource_id:resourceId})});setEdgeResult(`${drill.status}: simulated transport timeout. No PayPal request was sent. A business attention record was created.`);await refresh();})}>Simulate a transport failure &amp; handoff</Button></div><p role="status">{edgeResult||'Start a live round to test its actual claim.'}</p><p className="fine-print">Model or tool failure stops the run and creates a business attention record. Availability conflicts make the losing agent wait; sold inventory makes it stop.</p></Modal>
    <Modal open={modal==='business'} onOpenChange={open=>!open&&setModal(null)} title="Business controls" description="New quotes can adapt within your limits. Accepted prices and refund promises remain fixed."><div className="business-attention"><Badge tone={allAlerts.length?'warning':'good'}>{allAlerts.length?`${allAlerts.length} needs attention`:'No unresolved agent failures'}</Badge>{allAlerts.map(alert=><div key={alert.id}><p>{alert.message}</p><Button size="small" variant="outline" onClick={()=>perform(async()=>{await api(`/api/v1/merchant/alerts/${alert.id}/acknowledge`,{method:'POST'});await refresh();})}>Mark reviewed</Button></div>)}</div><details><summary>Automatic commitment pricing</summary><p className="fine-print">The business AI observes real demand, then recommends raise, lower, or keep. Code enforces the conditions and bounds.</p><form onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);perform(async()=>{const fields=['commitment_amount','currency','payment_mode','hold_duration_seconds','approval_claim_seconds','max_active_holds_per_buyer','repeat_cooldown_seconds','purchase_refund_bps','release_refund_bps','expiry_refund_bps'];const body=Object.fromEntries(fields.map(k=>[k,policy[k]]));body.automation={min_amount:Number(data.get('min')).toFixed(2),max_amount:Number(data.get('max')).toFixed(2),step_amount:'0.50',raise_at:3,lower_at:0,window_seconds:3600,cooldown_seconds:300};await api(`/api/v1/resources/${resourceId}/policy`,{method:'POST',body:JSON.stringify(body)});await refresh();setNotice('Business agent enabled within these limits.');});}}><div className="two-fields"><label>Minimum $<input name="min" type="number" min="0.01" step="0.01" defaultValue={policy?.automation?.min_amount||'1.00'} required/></label><label>Maximum $<input name="max" type="number" min="0.01" step="0.01" defaultValue={policy?.automation?.max_amount||'5.00'} required/></label></div><Button type="submit" disabled={busy}>Enable business agent</Button></form>{activity.business_decisions?.filter(d=>d.resource_id===resourceId).slice(0,1).map(d=><p key={d.id}>{d.status==='COMPLETED'?`${d.decision.action}: ${d.decision.explanation}`:'Evaluation pending or unavailable; previous quote preserved.'}</p>)}</details><p className="fine-print">Handoffs are recorded here for the business. No email or external notification is sent.</p><Button variant="ghost" onClick={()=>perform(async()=>{await api('/api/demo/session',{method:'DELETE'});location.reload();})}>Sign out</Button></Modal>
    <Modal open={modal==='why'} onOpenChange={open=>!open&&setModal(null)} title="A hold should mean something." description="Without commitment, an agent can keep renewing free holds while another buyer is blocked."><p>Resaf keeps legitimate agent reservations possible: the business quotes a commitment, PayPal verifies it, and the reservation has a firm end. A disclosed part can return when the buyer releases or completes the booking.</p><Button variant="outline" onClick={()=>perform(async()=>{const result=await api('/api/demo/legacy-comparison',{method:'POST',body:JSON.stringify({resource_id:resourceId})});setLegacy(`${result.events.filter(e=>e.outcome==='FREE_EXCLUSIVITY_GRANTED').length} free holds or renewals granted; another buyer was blocked.`);})}>Run the unprotected comparison</Button><p>{legacy}</p><p className="fine-print">Separate, persisted scripted comparison. No PayPal payment and no change to the protected inventory.</p></Modal>
  </>;
}
class ErrorBoundary extends React.Component{state={error:null};static getDerivedStateFromError(error){return {error};}render(){return this.state.error?<main><h1>The demo needs a refresh.</h1><p>The interface stopped safely. Existing payments remain recorded.</p><button onClick={()=>location.reload()}>Reload live state</button></main>:this.props.children;}}
createRoot(document.getElementById('root')).render(<ErrorBoundary><App/></ErrorBoundary>);
