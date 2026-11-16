import test from 'node:test';
import assert from 'node:assert/strict';
import {businessDate} from '../src/domain.js';
import {assertReviewedLeaseTransition} from '../src/lease-closure.js';
import {submitDepositProposal,approveDepositProposal,executeDepositProposal} from '../src/deposit-approvals.js';

test('V1.5: all financial calendar dates use the Vietnamese business day',()=>{
 assert.equal(businessDate(new Date('2026-11-10T18:45:00.000Z')),'2026-11-11');
 assert.equal(businessDate(new Date('2026-11-11T16:59:00.000Z')),'2026-11-11');
 assert.equal(businessDate(new Date('2026-11-11T17:01:00.000Z')),'2026-11-12');
});

test('V1.5: ending an active lease by ordinary PATCH is prohibited',()=>{
 assert.throws(()=>assertReviewedLeaseTransition({status:'active'},{status:'ended'}),error=>error.status===409&&/xem trước công nợ/.test(error.message));
 assert.doesNotThrow(()=>assertReviewedLeaseTransition({status:'active'},{status:'active'}));
 assert.doesNotThrow(()=>assertReviewedLeaseTransition({status:'draft'},{status:'active'}));
});

test('V1.5: approved deposit execution records the server-selected Vietnam business date',()=>{
 const db={
  leases:[{id:'l1',unitId:'u1',status:'ended'}],
  depositTransactions:[{id:'d1',leaseId:'l1',unitId:'u1',kind:'receive',amount:10_000_000}],
  depositSettlements:[],audit:[]
 };
 const maker={id:'staff-1',name:'Người đề nghị'},approver={id:'manager-1',name:'Người duyệt'},executor={id:'accountant-1',name:'Kế toán'};
 const proposal=submitDepositProposal(db,'l1',{refund:9_000_000,deduction:1_000_000,note:'Đối trừ tiền thuê chưa trả'},maker);
 approveDepositProposal(db,proposal.id,approver);
 const transaction=executeDepositProposal(db,proposal.id,executor,{reference:'BANK-2026-001',today:'1990-01-01'},'2026-11-11');
 assert.equal(transaction.date,'2026-11-11');
 assert.equal(transaction.refund,9_000_000);
 assert.equal(transaction.deduction,1_000_000);
 assert.equal(db.depositSettlements[0].status,'executed');
 assert.equal(db.depositTransactions.length,2);
});
