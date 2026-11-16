import test from 'node:test';
import assert from 'node:assert/strict';
import {find,paidFor,hasPaymentHistory,depositBalance,reminderQueue,samePersistedId} from '../src/domain.js';

const data=()=>({
 units:[{id:7,status:'active',code:'A-07'},{id:'07',status:'active',code:'A-007'},{id:8,status:'archived',code:'OLD'}],
 leases:[{id:8,unitId:'7',status:'ended',terminatedOn:'2026-11-01'},{id:'08',unitId:'07',status:'active'}],
 schedules:[{id:9,leaseId:'8',unitId:'7',status:'open',dueOn:'2026-11-03',amount:1500000},{id:'09',leaseId:'08',unitId:'07',status:'open',dueOn:'2026-11-10',amount:2000000}],
 payments:[{scheduleId:'9',status:'posted',amount:500000},{scheduleId:'09',status:'posted',amount:250000},{scheduleId:9,status:'reversed',amount:100000}],
 depositTransactions:[{leaseId:8,kind:'receive',amount:4000000},{leaseId:'8',kind:'settle',amount:1000000},{leaseId:'08',kind:'receive',amount:900000}],
 reminderContacts:[{id:1,scheduleId:'09',outcome:'called'},{id:2,scheduleId:9,outcome:'promised'}],
 preferences:{reminderDays:20}
});
test('V2.47 server find resolves numeric/string ID without linking leading-zero neighbor',()=>{
 const d=data();assert.equal(find(d.units,'7').code,'A-07');assert.equal(find(d.units,'07').code,'A-007');
 assert.throws(()=>find(d.units,'8'),e=>e.status===404);
 for(const invalid of ['',null,undefined,'008'])assert.throws(()=>find(d.units,invalid),e=>e.status===404);
});
test('V2.47 server rent reconciliation excludes reversed rows and foreign leading-zero receipts',()=>{
 const d=data(),before=structuredClone(d);
 assert.equal(paidFor(d,9),500000);assert.equal(paidFor(d,'09'),250000);
 assert.equal(hasPaymentHistory(d,9),true);assert.equal(hasPaymentHistory(d,'09'),true);
 assert.deepEqual(d,before);
});
test('V2.47 server deposit balance distinguishes approved settlement from a different lease ID',()=>{
 const d=data();assert.equal(depositBalance(d,8),3000000);assert.equal(depositBalance(d,'08'),900000);
 assert.equal(depositBalance(d,'008'),0);
});
test('V2.47 server reminders match schedules with contacts using persisted IDs',()=>{
 const d=data();const q=reminderQueue(d,'2026-11-01');
 assert.deepEqual(q.map(r=>r.id),['09'],'ended lease no longer receives post-termination reminder');
 assert.equal(q[0].contactCount,1);assert.equal(q[0].paid,250000);assert.equal(q[0].left,1750000);
 assert.equal(q[0].lastContact.outcome,'called');
});
test('V2.47 nonempty persisted ID comparison has no fuzzy numeric coercion',()=>{
 assert.equal(samePersistedId(9,'9'),true);assert.equal(samePersistedId(9,'09'),false);
 assert.equal(samePersistedId(0,'0'),true);assert.equal(samePersistedId('',''),false);
});
