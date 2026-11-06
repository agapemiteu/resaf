import test from 'node:test';
import assert from 'node:assert/strict';
import {generateAction} from '../src/agents/inference.mjs';
const contents=[{role:'user',parts:[{text:'Read policy'}]},{role:'model',parts:[{functionCall:{name:'get_resource',args:{resource_id:'unit'}}}]},{role:'user',parts:[{functionResponse:{name:'get_resource',response:{status:'AVAILABLE'}}}]}];
const input={contents,instructions:'Use actual responses',declarations:[]};
const env={GEMINI_API_KEY:'test-primary',GROQ_API_KEY:'test-backup'};
test('primary timeout switches inference provider and preserves completed tool history',async()=>{
 const phases=[];let backups=0;
 const result=await generateAction({...input,onProvider:phase=>phases.push(phase)}, {env,fetchImpl:async()=>{throw new DOMException('timeout','TimeoutError');},groq:async(system,history)=>{backups++;assert.equal(history,contents);return {provider:'groq',content:{parts:[{text:'Observed response'}]}};}});
 assert.equal(result.provider,'groq');assert.equal(backups,1);assert.deepEqual(phases.map(p=>p.provider),['gemini','groq']);
});
test('quota failure falls back but invalid credentials fail clearly',async()=>{
 let backups=0;const options={env,groq:async()=>{backups++;return {provider:'groq'};}};
 await generateAction(input,{...options,fetchImpl:async()=>new Response('{}',{status:429})});assert.equal(backups,1);
 await assert.rejects(()=>generateAction(input,{...options,fetchImpl:async()=>new Response('{}',{status:401})}),/401/);assert.equal(backups,1);
});
test('subsequent turns stay on the working fallback instead of waiting for primary again',async()=>{
 let primary=0;
 const result=await generateAction({...input,preferGroq:true},{env,fetchImpl:async()=>{primary++;},groq:async()=>({provider:'groq'})});
 assert.equal(result.provider,'groq');assert.equal(primary,0);
});
test('timeout while reading the primary body also falls back',async()=>{
 const result=await generateAction(input,{env,fetchImpl:async()=>({ok:true,json:async()=>{throw new DOMException('timeout','TimeoutError');}}),groq:async()=>({provider:'groq'})});assert.equal(result.provider,'groq');
});
test('missing fallback reports failure without inventing a model result',async()=>{
 await assert.rejects(()=>generateAction(input,{env:{GEMINI_API_KEY:'primary'},fetchImpl:async()=>{throw new DOMException('timeout','TimeoutError');}}),/timed out/);
});
