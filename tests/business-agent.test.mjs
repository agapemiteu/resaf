import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRecommendation } from '../src/agents/business.mjs';
const policy={commitment_amount:'2.00',automation:{min_amount:'1.00',max_amount:'3.00',step_amount:'0.50',raise_at:3,lower_at:0}};
test('AI actions cannot bypass business bounds or demand conditions',()=>{
 assert.equal(applyRecommendation(policy,3,'raise'),'2.50');
 assert.equal(applyRecommendation(policy,0,'lower'),'1.50');
 assert.equal(applyRecommendation(policy,3,'keep'),'2.00');
 assert.throws(()=>applyRecommendation(policy,0,'raise'));
 assert.throws(()=>applyRecommendation(policy,2,'lower'));
 assert.throws(()=>applyRecommendation(policy,3,'charge'));
 assert.throws(()=>applyRecommendation({...policy,commitment_amount:'3.00'},3,'raise'));
});
