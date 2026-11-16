import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../src/seed.js';
import {upgrade} from '../src/store.js';
import {reminderQueue, generateSchedules, clampDay, monthSequence, paidFor, depositBalance, feeFor} from '../src/domain.js';
import {hasPermission} from '../src/security.js';

const sample=()=>upgrade(seed());

test('V0.5 preserves previous demo records when upgrade adds contact ledger',()=>{
 const db=sample();assert.ok(Array.isArray(db.reminderContacts));assert.equal(db.version,9);
 assert.ok(db.units.length>=8);assert.ok(db.feeHistory.length>0);
});

test('reminder inbox only contains unpaid open schedules due by configured horizon',()=>{
 const db=sample();db.preferences.reminderDays=5;
 const rows=reminderQueue(db,'2026-11-22');
 assert.ok(rows.length>0);
 assert.ok(rows.every(s=>s.status==='open'&&s.left>0&&s.dueOn<='2026-11-27'));
 assert.ok(!rows.some(s=>s.status==='historical'));
 assert.ok(rows.some(s=>s.dueOn<'2026-11-22'));
});

test('reminder inbox excludes fully paid schedules and tracks last contact without treating it as paid',()=>{
 const db=sample(),s=db.schedules.find(s=>s.unitId==='u2'&&s.period==='2026-11');
 db.preferences.reminderDays=90;
 const before=paidFor(db,s.id),now='2026-11-20';
 db.reminderContacts.push({id:'c1',scheduleId:s.id,unitId:s.unitId,leaseId:s.leaseId,outcome:'called',nextContactOn:'2026-11-23'});
 const row=reminderQueue(db,now).find(x=>x.id===s.id);
 assert.equal(row.contactCount,1);assert.equal(row.lastContact.outcome,'called');assert.equal(row.paid,before);
 db.payments.push({id:'pExtra',scheduleId:s.id,amount:s.amount-before,status:'posted'});
 assert.equal(reminderQueue(db,now).find(x=>x.id===s.id),undefined);
});

test('term ends on first day of month: due date cannot exceed end of contract',()=>{
 const db=sample();db.units.push({id:'u-last-day',code:'TEST',feePercent:3,status:'occupied'});
 const schedule=generateSchedules(db,{id:'l-last-day',unitId:'u-last-day',status:'active',startsOn:'2027-01-31',endsOn:'2027-02-01',rent:1000000,paymentDay:31});
 assert.equal(schedule.length,2);
 assert.equal(schedule[0].dueOn,'2027-01-31');assert.equal(schedule[1].dueOn,'2027-02-01');
});

test('same effective date fee policy uses most recently created entry for new schedule',()=>{
 const db=sample();db.units.push({id:'u-fee',status:'occupied',feePercent:4,feeBasis:'due'});
 db.feeHistory.push({unitId:'u-fee',effectiveFrom:'2027-01-01',percent:5,basis:'due',createdAt:'2026-12-01T00:00:00Z'});
 db.feeHistory.push({unitId:'u-fee',effectiveFrom:'2027-01-01',percent:3.7,basis:'due',createdAt:'2026-12-02T00:00:00Z'});
 const sch=generateSchedules(db,{id:'l-fee',unitId:'u-fee',status:'active',startsOn:'2027-01-01',endsOn:'2027-01-30',rent:10000000,paymentDay:1})[0];
 assert.equal(sch.feePercent,3.7);assert.equal(feeFor(db,sch),370000);
});

test('Role permissions: staff records reminders only; viewer cannot mutate finance',()=>{
 const user=(role)=>({role});
 assert.equal(hasPermission(user('staff'),'reminder.write'),true);
 assert.equal(hasPermission(user('staff'),'payment.write'),false);
 assert.equal(hasPermission(user('viewer'),'unit.read'),true);
 assert.equal(hasPermission(user('viewer'),'unit.write'),false);
 assert.equal(hasPermission(user('accountant'),'reminder.write'),true);
 assert.equal(hasPermission(user('manager'),'fee.write'),true);
});

test('deposit balance is segregated from rent paid and fees',()=>{
 const db=sample(),lease=db.leases.find(l=>l.unitId==='u2');
 const s=db.schedules.find(x=>x.leaseId===lease.id&&x.period==='2026-11');
 assert.equal(depositBalance(db,lease.id),19000000);
 assert.equal(paidFor(db,s.id),4750000);
 assert.equal(feeFor(db,s),570000);
});
