import test from 'node:test';
import assert from 'node:assert/strict';
import {generateSchedules,feeFor,defaultPeriod,businessDate} from '../src/domain.js';
import {postRentPayment} from '../src/payment-operations.js';
import {leasePayload,hasActiveUnitLease} from '../src/lease-identity.js';
import {applyUnitFeePolicy} from '../src/fee-policy.js';
import {changeCompanyDefaultFee} from '../src/default-fee-policy.js';
import {assertCanReceiveDeposit,hasDepositLedgerForUnit} from '../src/finance-guards.js';
import {previewLeaseClosure,closeLease} from '../src/lease-closure.js';

const actor={id:'manager',name:'Người quản lý'};
const lease=()=>({id:'7',unitId:'8',status:'active',startsOn:'2026-11-01',endsOn:'2026-12-31',paymentDay:5,rent:10000000});
const base=()=>({
 preferences:{defaultFee:6,reminderDays:5},
 units:[{id:8,status:'occupied',feePercent:null,feeBasis:'due'}],
 leases:[lease()],
 schedules:[],payments:[],feeHistory:[],depositSettlements:[],depositTransactions:[],
 clients:[],reminderNotifications:[],reminderContacts:[],audit:[]
});
const schedule=(id,period='2026-11',rest={})=>({id,leaseId:7,unitId:8,period,dueOn:period+'-05',amount:10000000,feePercent:6,feeBasis:'due',status:'open',...rest});

test('V2.55: string lease ID matches stored numeric ID to prevent duplicate monthly invoice',()=>{
 const db=base();db.schedules=[schedule(101)];
 const added=generateSchedules(db,db.leases[0]);
 assert.equal(added.length,1);assert.equal(added[0].period,'2026-12');
 assert.equal(db.schedules.filter(s=>s.period==='2026-11').length,1);
});

test('V2.55: a leading-zero lease ID remains distinct from numeric historical ID',()=>{
 const db=base();db.schedules=[schedule(101,'2026-11',{leaseId:'07'})];
 const added=generateSchedules(db,db.leases[0]);
 assert.equal(added.length,2);
});

test('V2.55: correct dated fee policy applies when legacy unit reference is numeric',()=>{
 const db=base();db.feeHistory=[{id:1,unitId:8,percent:3.7,basis:'paid',effectiveFrom:'2026-01-01'}];
 const added=generateSchedules(db,db.leases[0]);
 assert.equal(added.length,2);assert.ok(added.every(s=>s.feePercent===3.7&&s.feeBasis==='paid'));
});

test('V2.55: payment can resolve a legacy numeric unit ID and still reject overpayment',()=>{
 const db=base();db.schedules=[schedule(101)];
 const saved=postRentPayment(db,{unitId:'8',period:'2026-11',amount:3000000,idempotencyKey:'tx-A'},actor,'2026-11-12');
 assert.equal(saved.scheduleId,101);assert.equal(db.payments.length,1);
 assert.throws(()=>postRentPayment(db,{unitId:8,period:'2026-11',amount:8000000},actor,'2026-11-12'),/lớn hơn/);
});

test('V2.55: same payment idempotency token replays across persisted ID numeric/string form',()=>{
 const db=base();db.schedules=[schedule(101)];
 const a=postRentPayment(db,{scheduleId:101,amount:2400000,idempotencyKey:'tx-B'},actor,'2026-11-12');
 const b=postRentPayment(db,{scheduleId:'101',amount:2400000,idempotencyKey:'tx-B'},actor,'2026-11-12');
 assert.equal(a,b);assert.equal(db.payments.length,1);
 assert.throws(()=>postRentPayment(db,{scheduleId:'0101',amount:2400000,idempotencyKey:'tx-B'},actor,'2026-11-12'),/đã được dùng/);
});

test('V2.55: repeated payment by unit and month follows the same idempotency contract',()=>{
 const db=base();db.schedules=[schedule(101)];
 const input={unitId:8,period:'2026-11',amount:1000000,idempotencyKey:'tx-C'};
 const a=postRentPayment(db,input,actor,'2026-11-12');
 assert.equal(postRentPayment(db,{...input,unitId:'8'},actor,'2026-11-12'),a);
 assert.throws(()=>postRentPayment(db,{...input,unitId:'08'},actor,'2026-11-12'),/đã được dùng/);
});

test('V2.55: active lease with numeric unit ID prevents another overlapping contract',()=>{
 const db=base();db.leases[0].unitId=8;
 assert.throws(()=>leasePayload({...lease(),id:'next'},db,{id:'next',status:'draft'}),/trùng thời gian/);
});

test('V2.55: a unit ID with leading zeros never collides with a different legacy unit',()=>{
 const db=base();db.units.push({id:'08',status:'occupied'});
 db.leases[0].unitId=8;
 const result=leasePayload({...lease(),unitId:'08'},db,{id:'next',status:'draft'});
 assert.equal(result.unitId,'08');
});

test('V2.55: changing unit fee updates matching upcoming schedules but not unrelated unit 08',()=>{
 const db=base();db.schedules=[schedule(101),schedule(102,'2026-12',{unitId:'08'})];
 const out=applyUnitFeePolicy(db,{unitId:'8',before:{feePercent:6},after:{feePercent:3.7,feeBasis:'paid'},effectiveFrom:'2026-11-01',reason:'Điều chỉnh',actorId:actor.id});
 assert.equal(out.updatedPeriods,1);assert.equal(db.schedules[0].feePercent,3.7);
 assert.equal(db.schedules[0].feeBasis,'paid');assert.equal(db.schedules[1].feePercent,6);
});

test('V2.55: company default changes matching numeric unit references only',()=>{
 const db=base();db.schedules=[schedule(101),schedule(102,'2026-12'),schedule(103,'2026-12',{unitId:'08'})];
 const out=changeCompanyDefaultFee(db,4.5,{effectiveOn:'2026-11-12',reason:'Điều chỉnh phí quản lý',actorId:actor.id});
 assert.equal(out.affectedUnits,1);assert.equal(out.updatedSchedules,1);
 assert.equal(db.schedules[0].feePercent,6);assert.equal(db.schedules[1].feePercent,4.5);assert.equal(db.schedules[2].feePercent,6);
 assert.equal(feeFor(db,db.schedules[1]),450000);
});

test('V2.55: a pending refund identified by numeric lease ID blocks new deposit receipt',()=>{
 const db=base();db.depositSettlements=[{leaseId:7,status:'pending'}];
 assert.throws(()=>assertCanReceiveDeposit(db,db.leases[0]),/Đang có đề nghị/);
 db.depositSettlements[0].leaseId='07';assert.doesNotThrow(()=>assertCanReceiveDeposit(db,db.leases[0]));
});

test('V2.55: lease close cancels only future unpaid periods of the same reference',()=>{
 const db=base();db.schedules=[schedule(101,'2026-11'),schedule(102,'2026-12'),schedule(103,'2026-12',{leaseId:'07'})];
 const input={effectiveOn:'2026-11-15',reason:'Hai bên thỏa thuận chấm dứt'};
 const review=previewLeaseClosure(db,db.leases[0],input,'2026-11-20');
 assert.equal(review.cancelledCount,1);assert.deepEqual(review.cancelledIds,[102]);
 const closed=closeLease(db,db.leases[0],input,actor,'2026-11-20');
 assert.equal(closed.status,'ended');assert.equal(db.schedules[1].status,'cancelled');
 assert.equal(db.schedules[2].status,'open');assert.equal(db.units[0].status,'ended');
});

test('V2.55: account period uses Vietnamese business date, not UTC month',()=>{
 assert.equal(defaultPeriod(),businessDate().slice(0,7));
});

test('V2.55: close resolves notifications referencing numeric schedule ID as text',()=>{
 const db=base();db.schedules=[schedule(101,'2026-12')];
 db.reminderNotifications=[{id:'n1',scheduleId:'101',status:'unread'},{id:'n2',scheduleId:'0101',status:'unread'}];
 closeLease(db,db.leases[0],{effectiveOn:'2026-11-15',reason:'Hai bên đồng ý kết thúc'},actor,'2026-11-20');
 assert.equal(db.reminderNotifications[0].status,'resolved');
 assert.equal(db.reminderNotifications[1].status,'unread');
});

test('V2.55: unit status cannot be edited while matching active lease references exist',()=>{
 const db=base();db.leases[0].unitId=8;
 assert.equal(hasActiveUnitLease(db,'8'),true);
 assert.equal(hasActiveUnitLease(db,'08'),false);
 assert.equal(hasActiveUnitLease(db,8,'7'),false);
});

test('V2.55: a historical deposit receipt locks direct unit deposit edits across ID types',()=>{
 const db=base();db.depositTransactions=[{unitId:8,leaseId:7,kind:'receive',amount:20000000}];
 assert.equal(hasDepositLedgerForUnit(db,'8'),true);
 assert.equal(hasDepositLedgerForUnit(db,'08'),false);
});
