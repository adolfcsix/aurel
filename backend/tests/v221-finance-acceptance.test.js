import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../src/seed.js';
import {upgrade} from '../src/store.js';
import {ROLE_PERMISSIONS,hasPermission} from '../src/security.js';
import {postRentPayment} from '../src/payment-operations.js';
import {submitDepositProposal,approveDepositProposal,executeDepositProposal,rejectDepositProposal} from '../src/deposit-approvals.js';
import {depositBalance,paidFor} from '../src/domain.js';
const day='2026-11-11';
const dbSample=()=>upgrade(seed());
const maker={id:'qa-maker',name:'Người lập'};
const approver={id:'qa-approver',name:'Người phê duyệt'};
const executor={id:'qa-executor',name:'Người xác nhận chi'};
const refundSample=()=>{
 const db=dbSample(),lease=db.leases.find(l=>depositBalance(db,l.id)>0);
 assert.ok(lease,'requires a seeded lease with a deposit ledger');
 lease.status='ended';return {db,lease,held:depositBalance(db,lease.id)};
};
test('V2.21: five built-in roles have explicit authorization boundaries',()=>{
 assert.deepEqual(Object.keys(ROLE_PERMISSIONS).sort(),['accountant','admin','manager','staff','viewer']);
 for(const role of Object.keys(ROLE_PERMISSIONS)){
  const actor={role};
  assert.equal(hasPermission(actor,'deposit.execute'),['admin','accountant'].includes(role));
  assert.equal(hasPermission(actor,'deposit.approve'),['admin','manager'].includes(role));
  assert.equal(hasPermission(actor,'payment.write'),['admin','manager','accountant'].includes(role));
  assert.equal(hasPermission(actor,'unit.write'),['admin','manager'].includes(role));
 }
});
test('V2.21: maker cannot approve own deposit proposal; no side effects on rejection',()=>{
 const {db,lease,held}=refundSample();const proposal=submitDepositProposal(db,lease.id,{refund:held,idempotencyKey:'qa-proposal-21'},maker);
 const events=db.audit.length;
 assert.throws(()=>approveDepositProposal(db,proposal.id,maker),e=>e.status===403);
 assert.equal(proposal.status,'pending');assert.equal(db.audit.length,events);
});
test('V2.21: maker and approver cannot confirm execution; distinct authorized executor can',()=>{
 const {db,lease,held}=refundSample(),p=submitDepositProposal(db,lease.id,{refund:held,idempotencyKey:'qa-proposal-22'},maker);
 approveDepositProposal(db,p.id,approver);
 const before=db.depositTransactions.length;
 for(const actor of [maker,approver])assert.throws(()=>executeDepositProposal(db,p.id,actor,{reference:'PAY-2221'},day),e=>e.status===403);
 assert.equal(db.depositTransactions.length,before);
 const result=executeDepositProposal(db,p.id,executor,{reference:'PAY-2221'},day);
 assert.equal(result.refund,held);assert.equal(p.status,'executed');
});
test('V2.21: duplicate post-reconnect payment with same idempotency key has one ledger impact',()=>{
 const db=dbSample(),schedule=db.schedules.find(s=>s.status==='open'&&s.amount-paidFor(db,s.id)>1500000&&db.leases.some(l=>l.id===s.leaseId&&l.status==='active'));
 assert.ok(schedule);const amount=1000000,base=paidFor(db,schedule.id),count=db.payments.length;
 const input={scheduleId:schedule.id,amount,date:day,reference:'BANK-V221-11',idempotencyKey:'qa-v221-receipt'};
 const first=postRentPayment(db,input,maker,day);
 assert.equal(postRentPayment(db,input,maker,day).id,first.id);
 assert.equal(db.payments.length,count+1);assert.equal(paidFor(db,schedule.id),base+amount);
});
test('V2.21: second proposal while first is awaiting approval fails with 409',()=>{
 const {db,lease,held}=refundSample();submitDepositProposal(db,lease.id,{refund:held,idempotencyKey:'qa-proposal-23'},maker);
 assert.throws(()=>submitDepositProposal(db,lease.id,{refund:held,idempotencyKey:'qa-proposal-24'},maker),e=>e.status===409);
 assert.equal(db.depositSettlements.filter(p=>p.leaseId===lease.id&&p.status==='pending').length,1);
});
test('V2.21: replay of executed refund does not create second settlement and mismatched reference fails',()=>{
 const {db,lease,held}=refundSample(),p=submitDepositProposal(db,lease.id,{refund:held,idempotencyKey:'qa-proposal-25'},maker);
 approveDepositProposal(db,p.id,approver);
 const first=executeDepositProposal(db,p.id,executor,{reference:'BANK-V221-25'},day);
 const before=db.depositTransactions.length;
 assert.equal(executeDepositProposal(db,p.id,executor,{reference:'BANK-V221-25'},day).id,first.id);
 assert.equal(db.depositTransactions.length,before);
 assert.throws(()=>executeDepositProposal(db,p.id,executor,{reference:'BANK-OTHER'},day),e=>e.status===409);
});
test('V2.21: rejected proposal cannot later be executed',()=>{
 const {db,lease,held}=refundSample(),p=submitDepositProposal(db,lease.id,{refund:held,idempotencyKey:'qa-proposal-27'},maker);
 approveDepositProposal(db,p.id,approver);
 rejectDepositProposal(db,p.id,approver,'Không đủ chứng từ xác minh');
 assert.throws(()=>executeDepositProposal(db,p.id,executor,{reference:'BANK-V221-27'},day),e=>e.status===409);
 assert.equal(p.status,'rejected');
});
