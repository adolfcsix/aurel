import test from 'node:test';
import assert from 'node:assert/strict';
import {makeImportConfirmation,assertImportConfirmation} from '../src/import-confirmation.js';
import {assertCanReceiveDeposit} from '../src/finance-guards.js';
import {submitDepositProposal,approveDepositProposal,executeDepositProposal} from '../src/deposit-approvals.js';
const digest='a'.repeat(64);
test('V1.6: import requires authentic, unexpired preview for same user and bytes',()=>{
 const token=makeImportConfirmation('manager',digest,1000);
 assert.equal(assertImportConfirmation('manager',digest,token,1500),true);
 assert.throws(()=>assertImportConfirmation('other',digest,token,1500),/hết hạn|thay đổi/i);
 assert.throws(()=>assertImportConfirmation('manager','b'.repeat(64),token,1500),/hết hạn|thay đổi/i);
 assert.throws(()=>assertImportConfirmation('manager',digest,token,1000+15*60*1000+1),/hết hạn/i);
 assert.throws(()=>assertImportConfirmation('manager',digest,token.slice(0,-1)+(token.endsWith('0')?'1':'0'),1500),/không hợp lệ/i);
 assert.throws(()=>assertImportConfirmation('manager',digest,'',1500),/Cần kiểm tra/i);
});
test('V1.6: a settled lease cannot accept another deposit',()=>{
 const db={depositSettlements:[]};
 assert.doesNotThrow(()=>assertCanReceiveDeposit(db,{id:'l1',status:'active'}));
 assert.throws(()=>assertCanReceiveDeposit(db,{id:'l1',status:'ended'}),/đã kết thúc/i);
 assert.throws(()=>assertCanReceiveDeposit({depositSettlements:[{leaseId:'l1',status:'approved'}]},{id:'l1',status:'active'}),/đề nghị hoàn cọc/i);
});
test('V1.6: payout is blocked if the held deposit changes upwards after preview',()=>{
 const requester={id:'maker',name:'Người lập'},approver={id:'approver'},executor={id:'accountant'};
 const db={leases:[{id:'l1',unitId:'u1',status:'ended'}],depositTransactions:[{id:'d1',leaseId:'l1',unitId:'u1',kind:'receive',amount:10_000_000}],depositSettlements:[],audit:[]};
 const proposal=submitDepositProposal(db,'l1',{refund:10_000_000,deduction:0},requester);
 approveDepositProposal(db,proposal.id,approver);
 db.depositTransactions.push({id:'d2',leaseId:'l1',unitId:'u1',kind:'receive',amount:1_000_000});
 assert.throws(()=>executeDepositProposal(db,proposal.id,executor,{reference:'BANK-12345'}),/Số dư cọc đã thay đổi/);
 assert.equal(db.depositSettlements[0].status,'approved');
});
