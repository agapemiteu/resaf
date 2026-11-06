import test from 'node:test';
import assert from 'node:assert/strict';
import {demoEntry} from '../ui/demo-entry.mjs';

test('ordinary refresh starts idle, including unrelated URL parameters',()=>{
  assert.equal(demoEntry(''),'demo-resource-001');
  assert.equal(demoEntry('?check=fresh'),'demo-resource-001');
});
test('only an explicit valid payment return selects a run',()=>{
  assert.equal(demoEntry('?resource=demo-1234'),'demo-1234');
  assert.equal(demoEntry('?resource=../../secret'),'demo-resource-001');
});
