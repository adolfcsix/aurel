import test from 'node:test';
import assert from 'node:assert/strict';
import {samePersistedId,financialIdempotencyKey} from '../src/domain.js';
import {submitDepositProposal,approveDepositProposal,executeDepositProposal} from '../src/deposit-approvals.js';
import {receiveDeposit} from '../src/deposit-receipts.js';
import {postRentPayment} from '../src/payment-operations.js';

const day='2026-11-12';
const user=(id)=>({id,name:`Kiểm tra ${id}`});
const refundState=()=>({leases:[{id:'lease-1',unitId:'unit-1',status:'ended'}],
 depositTransactions:[{id:'deposit-1',leaseId:'lease-1',unitId:'unit-1',kind:'receive',amount:2000000}],
 depositSettlements:[],audit:[]});
const paymentState=()=>({leases:[{id:'lease-1',unitId:'8',status:'active'},{id:'lease-2',unitId:'8',status:'active'}],
 schedules:[{id:'period-A',leaseId:'lease-1',unitId:8,period:'2026-11',dueOn:'2026-11-05',amount:10000000,status:'open'}],
 payments:[],audit:[]});
const isForbidden=(error)=>error.status===403;
const isConflict=(error)=>error.status===409;

// Financial segregation of duties also applies to legacy numeric actor identifiers.
test('V2.57: maker 7 cannot approve own proposal as string "7"',()=>{
 const db=refundState(),proposal=submitDepositProposal(db,'lease-1',{refund:2000000},user(7));
 const before=db.audit.length;
 assert.throws(()=>approveDepositProposal(db,proposal.id,user('7')),isForbidden);
 assert.equal(proposal.status,'pending');assert.equal(db.audit.length,before);
});
test('V2.57: maker 7 cannot execute proposal as string "7"',()=>{
 const db=refundState(),proposal=submitDepositProposal(db,'lease-1',{refund:2000000},user(7));
 approveDepositProposal(db,proposal.id,user(8));
 assert.throws(()=>executeDepositProposal(db,proposal.id,user('7'),{reference:'BANK-1234'},day),isForbidden);
 assert.equal(proposal.status,'approved');assert.equal(db.depositTransactions.length,1);
});
test('V2.57: approver 8 cannot execute as string "8"',()=>{
 const db=refundState(),proposal=submitDepositProposal(db,'lease-1',{refund:2000000},user(7));
 approveDepositProposal(db,proposal.id,user(8));
 assert.throws(()=>executeDepositProposal(db,proposal.id,user('8'),{reference:'BANK-1234'},day),isForbidden);
 assert.equal(db.depositTransactions.length,1);
});
test('V2.57: distinct executor can confirm deposit once after legacy numeric identities',()=>{
 const db=refundState(),proposal=submitDepositProposal(db,'lease-1',{refund:2000000},user(7));
 approveDepositProposal(db,proposal.id,user(8));
 const receipt=executeDepositProposal(db,proposal.id,user('9'),{reference:'BANK-1234'},day);
 assert.equal(receipt.refund,2000000);assert.equal(proposal.status,'executed');
 assert.equal(executeDepositProposal(db,proposal.id,user('9'),{reference:'BANK-1234'},day),receipt);
 assert.equal(db.depositTransactions.length,2);
});
test('V2.57: ID with leading zero is never conflated with another actor ID',()=>{
 assert.equal(samePersistedId('07',7),false);
 const db=refundState(),proposal=submitDepositProposal(db,'lease-1',{refund:2000000},user('07'));
 assert.equal(approveDepositProposal(db,proposal.id,user(7)).status,'approved');
 assert.equal(executeDepositProposal(db,proposal.id,user(8),{reference:'BANK-1234'},day).amount,2000000);
});
test('V2.57: replay of executed proposal finds legacy numeric/string proposal reference',()=>{
 const db=refundState();db.depositSettlements=[{id:101,leaseId:'lease-1',unitId:'unit-1',refund:2000000,deduction:0,
  status:'executed',createdBy:7,approvedBy:8,executedBy:9}];
 const row={id:'settle-1',proposalId:'101',leaseId:'lease-1',kind:'settle',amount:2000000,refund:2000000,
  reference:'BANK-101'};
 db.depositTransactions.push(row);
 assert.equal(executeDepositProposal(db,'101',user(9),{reference:'BANK-101'},day),row);
 assert.equal(db.depositTransactions.length,2);
});

test('V2.57: financial retry keys are not silently truncated',()=>{
 const prefix='p'.repeat(120);
 assert.equal(financialIdempotencyKey(' '+prefix+' '),prefix);
 assert.throws(()=>financialIdempotencyKey(prefix+'A'),e=>e.status===400);
 assert.throws(()=>financialIdempotencyKey(prefix+'B'),e=>e.status===400);
 assert.throws(()=>financialIdempotencyKey({value:prefix}),e=>e.status===400);
});
test('V2.57: invalid receipt retry key cannot create a deposit transaction',()=>{
 const db=refundState();db.leases[0].status='active';
 assert.throws(()=>receiveDeposit(db,'lease-1',{amount:10000,idempotencyKey:'k'.repeat(121)},user(7),day),e=>e.status===400);
 assert.equal(db.depositTransactions.length,1);
});
test('V2.57: invalid proposal retry key cannot create a refund proposal',()=>{
 const db=refundState();
 assert.throws(()=>submitDepositProposal(db,'lease-1',{refund:2000000,idempotencyKey:{id:'x'}},user(7)),e=>e.status===400);
 assert.equal(db.depositSettlements.length,0);
});
test('V2.57: invalid rent retry key cannot post a payment',()=>{
 const db=paymentState();
 assert.throws(()=>postRentPayment(db,{scheduleId:'period-A',amount:1000,idempotencyKey:'x'.repeat(121)},user(7),day),e=>e.status===400);
 assert.equal(db.payments.length,0);
});

test('V2.57: ambiguous unit + month cannot silently select first of two schedules',()=>{
 const db=paymentState();db.schedules.push({...db.schedules[0],id:'period-B',leaseId:'lease-2'});
 assert.throws(()=>postRentPayment(db,{unitId:'8',period:'2026-11',amount:1000},user(7),day),isConflict);
 assert.equal(db.payments.length,0);
 const receipt=postRentPayment(db,{scheduleId:'period-B',amount:1000},user(7),day);
 assert.equal(receipt.leaseId,'lease-2');assert.equal(receipt.scheduleId,'period-B');
});
test('V2.57: explicitly selected period rejects conflicting unit or month from stale UI',()=>{
 const db=paymentState();
 assert.throws(()=>postRentPayment(db,{scheduleId:'period-A',unitId:'08',amount:1000},user(7),day),isConflict);
 assert.throws(()=>postRentPayment(db,{scheduleId:'period-A',period:'2026-12',amount:1000},user(7),day),isConflict);
 assert.equal(db.payments.length,0);
 assert.equal(postRentPayment(db,{scheduleId:'period-A',unitId:'8',period:'2026-11',amount:1000},user(7),day).amount,1000);
});
test('V2.57: idempotent payment replay rejects contradictory supplied unit/month',()=>{
 const db=paymentState(),input={scheduleId:'period-A',unitId:'8',period:'2026-11',amount:1000,idempotencyKey:'replay-1'};
 const receipt=postRentPayment(db,input,user(7),day);
 assert.equal(postRentPayment(db,{...input,unitId:8},user(7),day),receipt);
 assert.throws(()=>postRentPayment(db,{...input,unitId:'08'},user(7),day),isConflict);
 assert.throws(()=>postRentPayment(db,{...input,period:'2026-12'},user(7),day),isConflict);
 assert.equal(db.payments.length,1);
});
test('V2.57: unrelated ID 08 schedule does not create ambiguity for unit ID 8',()=>{
 const db=paymentState();db.schedules.push({...db.schedules[0],id:'period-08',unitId:'08'});
 const receipt=postRentPayment(db,{unitId:'8',period:'2026-11',amount:1000},user(7),day);
 assert.equal(receipt.scheduleId,'period-A');
});
test('V2.57: numeric zero is a valid persisted ID, not an omitted identifier',()=>{
 const db=paymentState();db.schedules=[{...db.schedules[0],id:0,unitId:0}];
 assert.throws(()=>postRentPayment(db,{scheduleId:0,unitId:8,amount:1000},user(7),day),isConflict);
 const row=postRentPayment(db,{scheduleId:0,unitId:'0',amount:1000,idempotencyKey:'zero-key'},user(7),day);
 assert.equal(row.scheduleId,0);
 assert.equal(postRentPayment(db,{scheduleId:'0',unitId:0,amount:1000,idempotencyKey:'zero-key'},user(7),day),row);
 assert.equal(db.payments.length,1);
});
