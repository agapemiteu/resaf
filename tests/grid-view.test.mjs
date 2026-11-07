import test from 'node:test';
import assert from 'node:assert/strict';
import {presentRaceRow,raceSummary,readable,requestStages} from '../ui/grid-view.mjs';
const row=(overrides={})=>({actor:'Agent A',ownership:'NO CLAIM',outcome:'NOT_STARTED',next:'Agent chooses next tool',...overrides});
test('race presents an unpaid claim separately from verified reservation and sale',()=>{
  assert.equal(presentRaceRow(row({ownership:'PROVISIONAL CLAIM',outcome:'PENDING_COMMITMENT'})).access,'Checkout claim');
  assert.equal(presentRaceRow(row({ownership:'VERIFIED EXCLUSIVITY',outcome:'RESERVED'})).access,'Reserved');
  assert.equal(presentRaceRow(row({ownership:'VERIFIED EXCLUSIVITY',outcome:'PURCHASED'})).access,'Booked');
});
test('timeline only marks observed or server-verified payment stages',()=>{
  const run={steps:[{tool:'get_policy',result:{}},{tool:'request_reservation',result:{reservation_id:'fixture'}},{tool:'start_commitment',result:{status:'APPROVAL_REQUIRED'}}]};
  assert.deepEqual(requestStages(run,'PENDING_COMMITMENT').map(s=>s.state),['done','done','pending','idle']);
  assert.equal(requestStages(run,'RESERVED')[2].state,'done');
  assert.equal(requestStages(run,'PURCHASED')[3].state,'done');
  assert.equal(requestStages({steps:[{tool:'request_reservation',result:{error:'UNAVAILABLE'}}]},'UNAVAILABLE')[1].state,'blocked');
  assert.ok(requestStages(null,'NOT_STARTED').every(s=>s.state==='idle'));
});
test('waiting or failed requests never acquire a winner highlight',()=>{
  assert.equal(presentRaceRow(row({waiting:true,outcome:'WAITING_FOR_AVAILABILITY'})).tone,'waiting');
  assert.equal(presentRaceRow(row({outcome:'FAILED'})).tone,'error');
  assert.equal(presentRaceRow(row({outcome:'FAILED'})).access,'No claim');
  assert.equal(presentRaceRow(row()).next,'Run to start');
});
test('race summary identifies the actual holder and distinguishes approval from purchase',()=>{
  assert.equal(raceSummary([row(),row({actor:'Agent B'})]),'Ready for two requests');
  assert.equal(raceSummary([row(),row({actor:'Agent B',ownership:'PROVISIONAL CLAIM',outcome:'PENDING_COMMITMENT'})]),'Agent B has the checkout claim');
  assert.equal(raceSummary([row({ownership:'VERIFIED EXCLUSIVITY',outcome:'PURCHASED'})]),'Agent A completed the booking');
  assert.equal(readable('WAITING_FOR_AVAILABILITY'),'Waiting');
});
