import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReceipt } from '../src/core/reservations/receipt.mjs';
const reservation={id:'reservation',status:'PURCHASED',ended_at:'2026-11-06T12:00:00Z'};
const resource={title:'Space P-01',kind:'parking',merchant_name:'Example merchant'};
const payments=[{type:'PURCHASE_CAPTURE',status:'CAPTURED',provider_capture_id:'test-capture',amount:'25.00',currency:'USD'},
 {type:'COMMITMENT_FEE',provider_capture_id:'test-fee',amount:'2.00',status:'SETTLED'},
 {type:'COMMITMENT_REFUND',status:'REFUNDED',amount:'2.00',currency:'USD'}];
const capture={id:'test-capture',status:'COMPLETED',amount:{value:'25.00',currency_code:'USD'}};
test('receipt requires a purchased reservation and matching completed provider payment',()=>{
 for(const status of ['RESERVED','PURCHASE_PENDING','FAILED']) assert.equal(buildReceipt({...reservation,status},resource,payments,capture),null);
 for(const altered of [{status:'PENDING'},{id:'different'},{amount:{value:'24.00',currency_code:'USD'}},{amount:{value:'25.00',currency_code:'EUR'}}])
   assert.equal(buildReceipt(reservation,resource,payments,{...capture,...altered}),null);
});
test('receipt separates final payment, collected commitment and confirmed refunds',()=>{
 const receipt=buildReceipt(reservation,resource,payments,capture);
 assert.equal(receipt.amount,'25.00');assert.equal(receipt.commitment_collected,'2.00');assert.equal(receipt.commitment_refunded,'2.00');assert.equal(receipt.document_title,'Parking confirmation');
 const pending=buildReceipt(reservation,resource,payments.map(p=>p.type==='COMMITMENT_REFUND'?{...p,status:'REFUND_PENDING'}:p),capture);
 assert.equal(pending.commitment_refunded,'0.00');
});
