import test from 'node:test';
import assert from 'node:assert/strict';
import {selectRun,contenderRow} from '../public/agent-state.js';
test('catalog-only new runs remain selected instead of an old matching inspection',()=>{
 const old={id:'old',buyer_id:'buyer-a',status:'COMPLETED',created_at:'2026-11-06T06:00:00Z',objective:'Inspect unit',steps:[{arguments:{resource_id:'unit'}}]};
 const fresh={id:'new',buyer_id:'buyer-a',resource_id:'unit',created_at:'2026-11-06T07:00:00Z',status:'COMPLETED',objective:'Find a parking space',steps:[{tool:'search_resources',arguments:{}}]};
 assert.equal(selectRun([fresh,old],'buyer-a','unit',null).id,'new');
 assert.equal(selectRun([old],'buyer-a','unit',{...fresh,status:'QUEUED'}).id,'new');
 assert.equal(selectRun([fresh,old],'buyer-a','unit',fresh).id,'new');
});
test('a run from another resource or buyer cannot replace the focused run',()=>{
 const other={id:'other',buyer_id:'buyer-b',resource_id:'unit',objective:'Reserve',steps:[]};
 assert.equal(selectRun([other],'buyer-a','unit',null),null);
 assert.equal(selectRun([{...other,buyer_id:'buyer-a',resource_id:'elsewhere'}],'buyer-a','unit',null),null);
});
test('contention highlights distinguish unpaid claims from verified holds and failures',()=>{
 assert.equal(contenderRow('a',{status:'AWAITING_APPROVAL'},{status:'PENDING_COMMITMENT'}).ownership,'PROVISIONAL CLAIM');
 assert.equal(contenderRow('a',{status:'COMPLETED'},{status:'RESERVED'}).ownership,'VERIFIED EXCLUSIVITY');
 assert.equal(contenderRow('b',{status:'WAITING_FOR_AVAILABILITY'}).ownership,'NO CLAIM');
 assert.equal(contenderRow('b',{status:'FAILED'}).next,'Business alerted');
});
