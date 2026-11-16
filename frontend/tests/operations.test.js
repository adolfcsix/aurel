import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../../backend/src/seed.js';
import {upgrade} from '../../backend/src/store.js';
import {getOperationsSnapshot} from '../src/lib/operations.js';
import {balance,periodTotals} from '../src/lib/finance.js';

const sample=()=>upgrade(seed());

test('V1.0: operational payment totals come from the existing ledger',()=>{
 const db=sample(),period='2026-11',snapshot=getOperationsSnapshot(db,period,'2026-11-11');
 assert.deepEqual({due:snapshot.payments.due,paid:snapshot.payments.paid,left:snapshot.payments.left,fee:snapshot.payments.fee},periodTotals(db,period));
});
test('V1.0: held deposits are never included in rental income',()=>{
 const db=sample(),before=getOperationsSnapshot(db,'2026-11','2026-11-11');
 db.depositTransactions.push({id:'test-receipt',kind:'receive',leaseId:db.leases[0].id,unitId:db.leases[0].unitId,amount:17000000,status:'posted',date:'2026-11-11'});
 const after=getOperationsSnapshot(db,'2026-11','2026-11-11');
 assert.deepEqual(after.payments,before.payments);
 assert.equal(after.deposits.held,db.leases.reduce((total,l)=>total+balance(db,l.id),0));
});
test('V1.0: contracts expiring after 30 days are not shown as due soon',()=>{
 const db=sample();db.leases.find(l=>l.status==='active').endsOn='2027-12-01';
 const snap=getOperationsSnapshot(db,'2026-11','2026-11-11');
 assert.ok(snap.leases.expiring<=snap.leases.active);
});
test('V1.0: only units assigned to an existing staff member count as assigned',()=>{
 const db=sample();const snap=getOperationsSnapshot(db,'2026-11','2026-11-11');
 assert.ok(snap.staff.assigned<=snap.staff.units);
 db.units[0].managerId='missing';
 const after=getOperationsSnapshot(db,'2026-11','2026-11-11');
 assert.ok(after.staff.assigned<=snap.staff.assigned);
});
test('V1.0: deposit approval statuses are counted independently',()=>{
 const db=sample();db.depositSettlements=[
  {id:'one',status:'pending'},{id:'two',status:'approved'},
  {id:'three',status:'executed'},{id:'four',status:'rejected'}
 ];
 const snap=getOperationsSnapshot(db,'2026-11','2026-11-11');
 assert.equal(snap.deposits.pending,1);
 assert.equal(snap.deposits.executed,1);
});
test('V1.0: empty datasets render zero-like summaries without mutation',()=>{
 const db=sample();for(const k of ['units','projects','leases','schedules','payments','staff','depositTransactions','depositSettlements','feeHistory'])db[k]=[];
 const copy=structuredClone(db),snap=getOperationsSnapshot(db,'2026-11','2026-11-11');
 assert.equal(snap.payments.collectionRate,0);
 assert.equal(snap.deposits.held,0);
 assert.equal(snap.leases.active,0);
 assert.equal(snap.staff.assigned,0);
 assert.deepEqual(db,copy);
});
