import React,{useId,useState} from 'react';
import {Tabs} from '@base-ui/react/tabs';
import {Button} from './ui.jsx';
import {Icon} from './icon.jsx';
import {agentView,eventView} from '../agent-view.mjs';

export function LiveProcess({agents,signedIn,connected,onInspect,onRefresh,onIssue,labels}){
  const [selected,setSelected]=useState('a'),[expanded,setExpanded]=useState(()=>typeof window==='undefined'||!window.matchMedia('(max-width:850px)').matches),[retrying,setRetrying]=useState(false);
  const detailsId=useId();
  async function reconnect(){setRetrying(true);try{await onRefresh();}finally{setRetrying(false);}}
  return <aside className="process-panel" aria-label="Live agent execution">
    <div className="process-top"><span className="eyebrow">AGENTS</span><span className={`process-connection ${connected===false?'is-offline':''}`}><i/>{connected==null?'Connecting':connected?'Live':'Offline'}</span><button className="process-collapse" aria-label={expanded?'Collapse agent activity':'Expand agent activity'} aria-expanded={expanded} aria-controls={detailsId} onClick={()=>setExpanded(value=>!value)}><Icon name="down" className={expanded?'':'is-collapsed'}/></button></div>
    <Tabs.Root value={selected} onValueChange={value=>{setSelected(value);setExpanded(true);}}>
      <Tabs.List activateOnFocus className="agent-switcher" aria-label="Choose an agent">{['a','b'].map(name=>{
        const view=agentView(agents[name].run,{connected,signedIn});
        return <Tabs.Tab key={name} value={name} className="agent-tab" onClick={()=>setExpanded(true)}><span className="agent-tab-heading"><span className="agent-avatar"><Icon name="bot" size={25}/></span><strong>Agent {name.toUpperCase()}</strong><i className={`agent-indicator ${view.kind} ${view.busy?'pulse':''}`}/></span><span className="agent-tab-status">{view.short}</span></Tabs.Tab>;
      })}</Tabs.List>
      <div id={detailsId} hidden={!expanded} className="agent-detail-wrap">{['a','b'].map(name=>{
        const run=agents[name].run,view=agentView(run,{connected,signedIn}),steps=run?.steps||[];
        const model=run?.execution?.model||steps.findLast(step=>step.model)?.model;
        const current=view.busy&&run?.execution?.phase==='TOOL_CALL'?(labels[run.execution.tool]||run.execution.tool):view.message;
        return <Tabs.Panel key={name} value={name} keepMounted className="agent-view">
          <div className="agent-now" data-kind={view.kind}><p aria-live="polite">{current}</p>{view.busy&&<span className="activity-track" aria-hidden="true"><span/></span>}{view.kind==='offline'&&<Button variant="outline" size="small" onClick={reconnect} disabled={retrying}>{retrying?'Checking…':'Reconnect'}</Button>}{view.kind==='failed'&&<Button variant="outline" size="small" onClick={onIssue}>View issue</Button>}</div>
          {steps.length>0?<ol className="agent-event-list" aria-label={`Agent ${name.toUpperCase()} recent activity`}>{steps.slice(-3).map((step,index)=>{
            const event=eventView(step);
            return <li key={`${steps.length-index}-${step.occurred_at}`} data-kind={event.kind}><span className="event-symbol" aria-hidden="true"><Icon name={event.kind==='failed'?'alert':event.kind==='complete'?'check':'clock'} size={22}/></span><div><span>{labels[step.tool]||step.tool}</span><small title={event.label}>{event.label.replaceAll('_',' ')}</small></div></li>;
          })}</ol>:view.busy?<div className="agent-empty"><Icon name="bot" size={36}/></div>:null}
          {steps.length>0&&<div className="agent-detail-footer"><span title={model||undefined}>{model?`${run?.execution?.provider||steps.findLast(step=>step.provider)?.provider||'AI'} · ${steps.length} ${steps.length===1?'event':'events'}`:'AI tools'}</span><button onClick={onInspect}>Details<Icon name="arrow" size={20}/></button></div>}
        </Tabs.Panel>;
      })}</div>
    </Tabs.Root>
    <a className="process-api-link" href="/developers"><span className="api-icon-label"><Icon name="code"/>Try the API</span><Icon name="arrow"/></a>
  </aside>;
}
