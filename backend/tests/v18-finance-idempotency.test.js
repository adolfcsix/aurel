import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../src/seed.js';
import {upgrade} from '../src/store.js';
import {postRentPayment} from '../src/payment-operations.js';
import {submitDepositProposal,approveDepositProposal,executeDepositProposal} from '../src/deposit-approvals.js';
import {depositBalance,paidFor} from '../src/domain.js';

const sample=()=>upgrade(seed());
const actor={id:'qa-accountant',name:'QA Accountant'};
const day='2026-11-11';
function openSchedule(db){
 return db.schedules.find(s=>s.status==='open'&&s.dueOn>=day&&s.amount-paidFor(db,s.id)>=3000000&&db.leases.some(l=>l.id===s.leaseId&&l.status==='active'));
}
test('V1.8: rent receipt is posted exactly once on initial request and retry',()=>{
 const db=sample(),s=openSchedule(db);assert.ok(s);
 const input={scheduleId:s.id,amount:1200000,date:day,reference:'BANK-123',method:'Chuyển khoản',idempotencyKey:'qa-pay-1'};
 const count=db.payments.length,baseline=paidFor(db,s.id);
 const first=postRentPayment(db,input,actor,day);
 const repeat=postRentPayment(db,input,actor,day);
 assert.equal(repeat.id,first.id);assert.equal(db.payments.length,count+1);
 assert.equal(paidFor(db,s.id),baseline+1200000);
});
test('V1.8: retry of authorized rent receipt works after schedule is closed and archived',()=>{
 const db=sample(),s=openSchedule(db);
 const input={scheduleId:s.id,amount:1200000,date:day,idempotencyKey:'qa-pay-closed'};
 const first=postRentPayment(db,input,actor,day);
 s.status='historical';
 assert.equal(postRentPayment(db,input,actor,day).id,first.id);
 s.status='archived';
 assert.equal(postRentPayment(db,input,actor,day).id,first.id);
 assert.equal(db.payments.filter(p=>p.idempotencyKey==='qa-pay-closed').length,1);
 assert.throws(()=>postRentPayment(db,{scheduleId:s.id,amount:1200000,date:day,idempotencyKey:'qa-new-pay'},actor,day),e=>e.status===404||e.status===409);
});
test('V1.8: reused idempotency key with different date, amount, schedule, reference or method is rejected',()=>{
 const db=sample(),s=openSchedule(db);
 const input={scheduleId:s.id,amount:1230000,date:day,reference:'BANK-222',method:'Chuyển khoản',idempotencyKey:'qa-pay-2'};
 postRentPayment(db,input,actor,day);
 const changes=[{amount:1300000},{date:'2026-11-10'},{scheduleId:'wrong'},{reference:'BANK-223'},{method:'Tiền mặt'},{note:'Different accounting note'}];
 for(const change of changes)assert.throws(()=>postRentPayment(db,{...input,...change},actor,day),e=>e.status===409);
});
test('V1.8: new payment cannot overpay and cannot use future or fractional currency',()=>{
 const db=sample(),s=openSchedule(db);
 assert.throws(()=>postRentPayment(db,{scheduleId:s.id,amount:s.amount+1},actor,day));
 assert.throws(()=>postRentPayment(db,{scheduleId:s.id,amount:1.4},actor,day));
 assert.throws(()=>postRentPayment(db,{scheduleId:s.id,amount:10000,date:'2026-11-12'},actor,day));
});
function refundSample(){
 const db=sample();
 const lease=db.leases.find(l=>l.unitId==='u1');assert.ok(lease);
 lease.status='ended';
 return {db,lease};
}
test('V1.8: approved deposit settlement can be retried but not with a different bank reference',()=>{
 const {db,lease}=refundSample();const held=depositBalance(db,lease.id);
 const proposal=submitDepositProposal(db,lease.id,{refund:held,deduction:0,note:'QA refund'},actor);
 approveDepositProposal(db,proposal.id,{id:'qa-manager',name:'QA Manager'});
 const executor={id:'qa-cashier',name:'QA Cashier'};
 const done=executeDepositProposal(db,proposal.id,executor,{reference:'PAY-REF-1001'},day);
 assert.equal(executeDepositProposal(db,proposal.id,executor,{reference:'PAY-REF-1001'},day).id,done.id);
 assert.equal(db.depositTransactions.filter(t=>t.proposalId===proposal.id).length,1);
 assert.throws(()=>executeDepositProposal(db,proposal.id,executor,{reference:'PAY-REF-OTHER'},day),e=>e.status===409);
});
test('V1.8: bank reference cannot be used for two distinct completed deposit refunds',()=>{
 const {db,lease}=refundSample();const held=depositBalance(db,lease.id);
 const p1=submitDepositProposal(db,lease.id,{refund:Math.round(held/2),deduction:0,note:'QA first'},actor);
 approveDepositProposal(db,p1.id,{id:'qa-manager'});
 executeDepositProposal(db,p1.id,{id:'qa-cashier'},{reference:'BANK-DUPLICATE-1'},day);
 const p2=submitDepositProposal(db,lease.id,{refund:held-Math.round(held/2),deduction:0,note:'QA second'},actor);
 approveDepositProposal(db,p2.id,{id:'qa-manager'});
 assert.throws(()=>executeDepositProposal(db,p2.id,{id:'qa-cashier'},{reference:'BANK-DUPLICATE-1'},day),e=>e.status===409);
 assert.equal(db.depositTransactions.filter(t=>t.kind==='settle').length,1);
});

test('V1.8: API distinguishes liveness from database readiness',async()=>{
 const {readFile}=await import('node:fs/promises');
 const api=await readFile(new URL('../src/index.js',import.meta.url),'utf8');
 assert.match(api,/app\.get\('\/api\/ready'/);
 assert.match(api,/res\.status\(503\)\.json\(\{ready:false/);
});
