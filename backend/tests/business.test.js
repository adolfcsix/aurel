import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../src/seed.js';
import {upgrade} from '../src/store.js';
import {clampDay,monthSequence,generateSchedules,paidFor,feeFor,depositBalance,dateOk,vnd,percent} from '../src/domain.js';

const sample=()=>upgrade(seed());
test('migrate demo spreadsheet references into projects, buildings, owners, leases',()=>{
 const db=sample();assert.ok(db.projects.length>=3);assert.ok(db.buildings.length>=7);assert.ok(db.clients.length>=4);
 assert.ok(db.leases.find(l=>l.unitId==='u1'));assert.ok(db.schedules.find(s=>s.unitId==='u1'&&s.period==='2026-11'));
 assert.ok(db.schedules.filter(s=>s.period<'2026-11').every(s=>s.status==='historical'));
});
test('create monthly due dates clamped at last calendar day',()=>{
 assert.equal(clampDay(2027,2,31),'2027-02-28');assert.equal(clampDay(2028,2,31),'2028-02-29');
 assert.deepEqual(monthSequence('2026-11-30','2027-02-10'),['2026-11','2026-12','2027-01','2027-02']);
});
test('multiple partial payments reduce debt exactly',()=>{
 const db=sample(),s=db.schedules.find(s=>s.unitId==='u2'&&s.period==='2026-11');
 assert.equal(s.amount,9500000);assert.equal(paidFor(db,s.id),4750000);
 db.payments.push({scheduleId:s.id,amount:4750000,status:'posted'});
 assert.equal(paidFor(db,s.id),9500000);
});
test('reversed payment is excluded from amount paid',()=>{
 const db=sample(),s=db.schedules.find(s=>s.unitId==='u2'&&s.period==='2026-11');
 const p=db.payments.find(p=>p.id==='pay2');p.status='reversed';assert.equal(paidFor(db,s.id),0);
});
test('fee snapshot remains on issued schedule despite unit policy edit',()=>{
 const db=sample(),s=db.schedules.find(s=>s.unitId==='u1'&&s.period==='2026-11');
 assert.equal(s.feePercent,6);assert.equal(feeFor(db,s),642000);
 db.units.find(u=>u.id==='u1').feePercent=3.7;
 assert.equal(s.feePercent,6);assert.equal(feeFor(db,s),642000);
});
test('separate deposit ledger records refundable balance',()=>{
 const db=sample(),l=db.leases.find(l=>l.unitId==='u1');assert.equal(depositBalance(db,l.id),21400000);
 db.depositTransactions.push({leaseId:l.id,kind:'settle',amount:14000000,refund:13000000,deduction:1000000});
 assert.equal(depositBalance(db,l.id),7400000);
});
test('reject invalid monetary and date inputs',()=>{
 assert.equal(dateOk('2026-02-30'),false);assert.equal(dateOk('2028-02-29'),true);
 assert.throws(()=>vnd(12.4,'Tiền thuê'));assert.throws(()=>percent(101));
});

test('incomplete lease drafts do not create finance records',()=>{
 const db=sample(),old=db.schedules.length;const draft={id:'new-draft',unitId:'',status:'draft',startsOn:'2026-11-01',endsOn:'2026-12-01',rent:1000000};
 assert.deepEqual(generateSchedules(db,draft),[]);assert.equal(db.schedules.length,old);
});
test('unset unit fee applies configured default only when a new schedule is issued',()=>{
 const db=sample();db.preferences.defaultFee=4.25;db.units.push({id:'blank',status:'occupied',rent:8000000,feePercent:null,feeBasis:'due'});
 const rows=generateSchedules(db,{id:'blank-lease',unitId:'blank',status:'active',startsOn:'2026-12-01',endsOn:'2026-12-31',rent:8000000,paymentDay:15});
 assert.equal(rows.length,1);assert.equal(rows[0].feePercent,4.25);assert.equal(feeFor(db,rows[0]),340000);
});
