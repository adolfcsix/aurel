import test from 'node:test';
import assert from 'node:assert/strict';
import {hasDepositLedgerForUnit,assertSafeDepositReferenceEdit} from '../src/finance-guards.js';
import {vnd} from '../src/domain.js';

const ledger=()=>({depositTransactions:[{unitId:7,kind:'receive',amount:5000000}],depositSettlements:[],leases:[]});
test('V2.61: re-submitting a formatted amount does not falsely count as a deposit edit',()=>{
 const db=ledger();
 assert.doesNotThrow(()=>assertSafeDepositReferenceEdit(db,'7',5000000,vnd('5000000','Tiền cọc')));
 assert.doesNotThrow(()=>assertSafeDepositReferenceEdit(db,'7',null,vnd('','Tiền cọc')));
});
test('V2.61: actual deposit change remains blocked after a receipt exists',()=>{
 assert.throws(()=>assertSafeDepositReferenceEdit(ledger(),'7',5000000,6000000),/đã có chứng từ/);
 assert.doesNotThrow(()=>assertSafeDepositReferenceEdit(ledger(),'07',5000000,6000000));
});
test('V2.61: pending settlement without a transaction still locks the reference amount',()=>{
 const db={depositTransactions:[],depositSettlements:[{unitId:'7',status:'pending'}],leases:[]};
 assert.equal(hasDepositLedgerForUnit(db,7),true);
 assert.throws(()=>assertSafeDepositReferenceEdit(db,7,null,9000000),/đã có chứng từ/);
});
test('V2.61: lease-only settlement reference is checked using persisted identifiers',()=>{
 const db={depositTransactions:[],depositSettlements:[{leaseId:33,status:'approved'}],leases:[{id:'33',unitId:'7'}]};
 assert.equal(hasDepositLedgerForUnit(db,7),true);
 assert.equal(hasDepositLedgerForUnit(db,'07'),false);
});
test('V2.61: rejected proposals alone do not freeze the editable reference field',()=>{
 const db={depositTransactions:[],depositSettlements:[{leaseId:33,status:'rejected'}],leases:[{id:33,unitId:'7'}]};
 assert.equal(hasDepositLedgerForUnit(db,'7'),false);
 assert.doesNotThrow(()=>assertSafeDepositReferenceEdit(db,'7',null,8000000));
});
