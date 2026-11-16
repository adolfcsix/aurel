import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {seed} from '../src/seed.js';
import {upgrade} from '../src/store.js';
import {depositBalance} from '../src/domain.js';
import {receiveDeposit} from '../src/deposit-receipts.js';
import {submitDepositProposal,approveDepositProposal,executeDepositProposal} from '../src/deposit-approvals.js';

const date='2026-11-11';
const maker={id:'v22-maker',name:'Người lập'};
const checker={id:'v22-checker',name:'Người duyệt'};
const payer={id:'v22-payer',name:'Kế toán chi'};
function scenario(){
 const db=upgrade(seed());
 const lease=db.leases.find(l=>l.unitId==='u1');
 assert.ok(lease);
 lease.status='ended';
 assert.ok(depositBalance(db,lease.id)>0);
 return {db,lease};
}

test('V2.2: auto-calculated refund proposal replays without re-evaluating new balance',()=>{
 const {db,lease}=scenario();
 const input={idempotencyKey:'v22-auto-refund-001',note:'Hoàn số cọc còn lại'};
 const first=submitDepositProposal(db,lease.id,input,maker);
 assert.equal(first.refund,first.balanceAtRequest);
 assert.equal(first.deduction,0);
 db.depositTransactions.push({id:'test-stale-balance',leaseId:lease.id,kind:'receive',amount:20000});
 const retry=submitDepositProposal(db,lease.id,input,maker);
 assert.equal(retry.id,first.id,'retry should return original proposal without recalculating');
 assert.equal(db.depositSettlements.filter(x=>x.idempotencyKey===input.idempotencyKey).length,1);
 assert.throws(()=>submitDepositProposal(db,lease.id,{...input,refund:first.refund+1000},maker),e=>e.status===409);
 assert.throws(()=>submitDepositProposal(db,lease.id,{...input,note:'Đã đổi lý do'},maker),e=>e.status===409);
});

test('V2.2: maker, checker and payer must be different even if all permissions belong to an admin',()=>{
 const {db,lease}=scenario();
 const first=submitDepositProposal(db,lease.id,{refund:1000000,deduction:0},maker);
 assert.throws(()=>approveDepositProposal(db,first.id,maker),e=>e.status===403);
 approveDepositProposal(db,first.id,checker);
 assert.throws(()=>executeDepositProposal(db,first.id,maker,{reference:'BANK-V22-1'},date),e=>e.status===403);
 assert.throws(()=>executeDepositProposal(db,first.id,checker,{reference:'BANK-V22-1'},date),e=>e.status===403);
 const record=executeDepositProposal(db,first.id,payer,{reference:'BANK-V22-1'},date);
 assert.equal(record.amount,1000000);
 assert.equal(executeDepositProposal(db,first.id,payer,{reference:'BANK-V22-1'},date).id,record.id);
 assert.equal(db.depositTransactions.filter(x=>x.proposalId===first.id).length,1);
});

test('V2.2: receipt retry returns original receipt after lease closure; changed details conflict',()=>{
 const {db,lease}=scenario();
 // The first receipt is written while the lease is active. A retry may arrive
 // after it ended; this must return the original record and never re-credit cash.
 lease.status='active';
 const initial={amount:1200000,idempotencyKey:'v22-receive-001',note:'Cọc bổ sung theo biên nhận'};
 const first=receiveDeposit(db,lease.id,initial,maker,date);
 assert.equal(first.amount,1200000);
 lease.status='ended';
 const retry=receiveDeposit(db,lease.id,initial,maker,date);
 assert.equal(retry.id,first.id);
 assert.equal(db.depositTransactions.filter(x=>x.idempotencyKey==='v22-receive-001').length,1);
 assert.throws(()=>receiveDeposit(db,lease.id,{...initial,amount:1300000},maker,date),e=>e.status===409);
 assert.throws(()=>receiveDeposit(db,lease.id,{...initial,note:'Nội dung thay đổi'},maker,date),e=>e.status===409);
 assert.throws(()=>receiveDeposit(db,lease.id,{amount:1000,idempotencyKey:'v22-new-receipt'},maker,date),/kết thúc|chấm dứt|đang/);
});

test('V2.2: settlement failure cannot silently alter held deposit balance',()=>{
 const {db,lease}=scenario();
 const initial=depositBalance(db,lease.id);
 const proposal=submitDepositProposal(db,lease.id,{refund:initial, idempotencyKey:'v22-total-refund'},maker);
 approveDepositProposal(db,proposal.id,checker);
 assert.throws(()=>executeDepositProposal(db,proposal.id,checker,{reference:'UNAUTHORIZED'},date),e=>e.status===403);
 assert.equal(depositBalance(db,lease.id),initial);
 assert.equal(proposal.status,'approved');
});
