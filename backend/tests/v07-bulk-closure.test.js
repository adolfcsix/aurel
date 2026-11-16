import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../src/seed.js';
import {upgrade} from '../src/store.js';
import {cleanUnit} from '../src/unit-validation.js';
import {simulateBulkUnits,commitBulkUnits} from '../src/bulk-units.js';
import {previewLeaseClosure,closeLease} from '../src/lease-closure.js';
import {paidFor,reminderQueue} from '../src/domain.js';
const day='2026-11-11';
const actor={id:'admin',name:'QA Admin'};
const data=()=>upgrade(seed());
const args={day};
const base={ids:['u2','u3'],changes:{managerId:'s1',floor:'19',feePercent:3.7},feeEffectiveFrom:'2026-12-01',feeReason:'Thống nhất phí quản lý quý IV'};

test('bulk preview is read-only, reports only changed fields and gets stable fingerprint',()=>{
 const db=data(),snapshot=structuredClone(db);
 const r=simulateBulkUnits(db,base,cleanUnit,args);
 assert.equal(r.rows.length,2);
 assert.ok(r.rows.every(x=>x.changedFields.includes('feePercent')));
 assert.equal(r.fingerprint.length,64);
 assert.deepEqual(db,snapshot);
 assert.equal(r.simulated.units.find(u=>u.id==='u2').floor,'19');
});
test('bulk commit updates exact selected apartments and fee histories atomically',()=>{
 const db=data(),before=db.feeHistory.length;
 const preview=simulateBulkUnits(db,base,cleanUnit,args);
 const result=commitBulkUnits(db,{...base,fingerprint:preview.fingerprint},cleanUnit,actor,args);
 assert.equal(result.updated,2);
 assert.equal(db.units.find(u=>u.id==='u2').managerId,'s1');
 assert.equal(db.units.find(u=>u.id==='u2').feePercent,3.7);
 assert.equal(db.units.find(u=>u.id==='u4').feePercent,3.7);
 assert.equal(db.feeHistory.length,before+2);
 assert.ok(db.feeHistory.filter(x=>['u2','u3'].includes(x.unitId)&&x.reason===base.feeReason).every(x=>x.changedBy==='admin'));
 assert.equal(db.audit.filter(a=>a.event==='unit.bulk_update').length,2);
});
test('bulk fee edit preserves November partially-paid schedule snapshots and updates future untouched ones',()=>{
 const db=data();const nov=db.schedules.find(s=>s.unitId==='u2'&&s.period==='2026-11');
 const dec=db.schedules.find(s=>s.unitId==='u2'&&s.period==='2026-12');
 assert.ok(paidFor(db,nov.id)>0);assert.equal(paidFor(db,dec.id),0);
 const oldNov=nov.feePercent;
 const preview=simulateBulkUnits(db,base,cleanUnit,args);
 commitBulkUnits(db,{...base,fingerprint:preview.fingerprint},cleanUnit,actor,args);
 assert.equal(nov.feePercent,oldNov);
 assert.equal(db.schedules.find(s=>s.id===dec.id).feePercent,3.7);
});
test('bulk commit rejects stale preview without modifying data',()=>{
 const db=data(),preview=simulateBulkUnits(db,base,cleanUnit,args);
 db.units.find(u=>u.id==='u2').room='10';const snapshot=structuredClone(db);
 assert.throws(()=>commitBulkUnits(db,{...base,fingerprint:preview.fingerprint},cleanUnit,actor,args),/đã thay đổi/);
 assert.deepEqual(db,snapshot);
});
test('bulk rejects unauthorized field overwrites, duplicates, >100 IDs, and historical fees',()=>{
 const db=data();
 assert.throws(()=>simulateBulkUnits(db,{ids:['u2'],changes:{rent:0}},cleanUnit,args),/không được hỗ trợ/);
 assert.throws(()=>simulateBulkUnits(db,{ids:['u2','u2'],changes:{floor:'33'}},cleanUnit,args),/1–100/);
 assert.throws(()=>simulateBulkUnits(db,{ids:Array(101).fill('u2'),changes:{floor:'33'}},cleanUnit,args),/1–100/);
 assert.throws(()=>simulateBulkUnits(db,{...base,feeEffectiveFrom:'2026-01-01'},cleanUnit,args),/hồi tố/);
});
test('bulk rejects invalid building references and preserves all originals',()=>{
 const db=data(),before=structuredClone(db);
 assert.throws(()=>simulateBulkUnits(db,{ids:['u2'],changes:{buildingId:'missing-building'}},cleanUnit,args),/Tòa nhà không tồn tại/);
 assert.deepEqual(db,before);
});
test('bulk accepts optional blank data without requiring rent, owner or address',()=>{
 const db=data(),req={ids:['u6'],changes:{address:'',floor:'',room:''}};
 const preview=simulateBulkUnits(db,req,cleanUnit,args);
 const saved=commitBulkUnits(db,{...req,fingerprint:preview.fingerprint},cleanUnit,actor,args);
 assert.equal(saved.total,1);assert.equal(db.units.find(u=>u.id==='u6').address,'');
});

test('closing lease previews future unpaid periods without mutation',()=>{
 const db=data(),lease=db.leases.find(l=>l.unitId==='u2');const original=structuredClone(db);
 const result=previewLeaseClosure(db,lease,{effectiveOn:day},day);
 assert.ok(result.cancelledCount>=1);
 assert.ok(result.retainedCount>=1);
 assert.equal(result.effectiveOn,day);
 assert.deepEqual(db,original);
});
test('closing lease cancels only untouched future periods while preserving partial payments',()=>{
 const db=data(),lease=db.leases.find(l=>l.unitId==='u2');
 const nov=db.schedules.find(s=>s.leaseId===lease.id&&s.period==='2026-11');
 const dec=db.schedules.find(s=>s.leaseId===lease.id&&s.period==='2026-12');
 const before=db.payments.length;assert.ok(paidFor(db,nov.id)>0);
 const result=closeLease(db,lease,{effectiveOn:day,reason:'Khách đã trả phòng trước ngày hết hạn'},actor,day);
 assert.equal(lease.status,'ended');assert.equal(lease.terminatedOn,day);
 assert.equal(nov.status,'open');assert.equal(dec.status,'cancelled');
 assert.equal(db.payments.length,before);
 assert.equal(result.closure.cancelledCount>=1,true);
 assert.equal(db.audit[0].event,'lease.closed');
});
test('closing preserves a partially paid future period for manual reconciliation',()=>{
 const db=data(),lease=db.leases.find(l=>l.unitId==='u2');
 const dec=db.schedules.find(s=>s.leaseId===lease.id&&s.period==='2026-12');
 db.payments.push({id:'future-payment',scheduleId:dec.id,leaseId:lease.id,unitId:'u2',status:'posted',amount:2000000});
 const result=closeLease(db,lease,{effectiveOn:day,reason:'Kết thúc hợp đồng theo biên bản'},actor,day);
 assert.equal(dec.status,'open');assert.ok(result.closure.paidFuturePeriods>=1);
});
test('closing refuses missing reason, future date and double close',()=>{
 const db=data(),lease=db.leases.find(l=>l.unitId==='u2');
 assert.throws(()=>closeLease(db,lease,{effectiveOn:day,reason:'a'},actor,day),/lý do/);
 assert.equal(lease.status,'active');
 assert.throws(()=>previewLeaseClosure(db,lease,{effectiveOn:'2026-12-01'},day),/tương lai/);
 closeLease(db,lease,{effectiveOn:day,reason:'Kết thúc hợp đồng theo yêu cầu khách'},actor,day);
 assert.throws(()=>closeLease(db,lease,{effectiveOn:day,reason:'Kết thúc lần nữa'},actor,day),/đang hoạt động/);
});
test('bulk moving building automatically realigns parent project and shows both in preview',()=>{
 const db=data(),req={ids:['u2'],changes:{buildingId:'building-imperia-I1'}};
 const preview=simulateBulkUnits(db,req,cleanUnit,args);
 assert.equal(preview.rows[0].after.projectId,'imperia');
 assert.equal(preview.rows[0].after.buildingId,'building-imperia-I1');
 commitBulkUnits(db,{...req,fingerprint:preview.fingerprint},cleanUnit,actor,args);
 assert.equal(db.units.find(u=>u.id==='u2').projectId,'imperia');
});
test('bulk changing project clears old building link; preview includes the collateral field',()=>{
 const db=data(),req={ids:['u2'],changes:{projectId:'imperia'}};
 const preview=simulateBulkUnits(db,req,cleanUnit,args);
 assert.equal(preview.rows[0].after.buildingId,'');
 assert.ok(preview.rows[0].changedFields.includes('building'));
});
test('lease closure preview fingerprint changes when payment ledger is updated',()=>{
 const db=data(),lease=db.leases.find(l=>l.unitId==='u2');
 const first=previewLeaseClosure(db,lease,{effectiveOn:day},day);
 const dec=db.schedules.find(s=>s.leaseId===lease.id&&s.period==='2026-12');
 db.payments.push({id:'extra',leaseId:lease.id,scheduleId:dec.id,unitId:lease.unitId,amount:100000,status:'posted'});
 const second=previewLeaseClosure(db,lease,{effectiveOn:day},day);
 assert.notEqual(first.fingerprint,second.fingerprint);
 assert.ok(first.cancelledCount>second.cancelledCount);
});
test('early termination suppresses future collection reminders and resolves outdated notifications',()=>{
 const db=data(),lease=db.leases.find(l=>l.unitId==='u2');
 const dec=db.schedules.find(s=>s.leaseId===lease.id&&s.period==='2026-12');
 db.payments.push({id:'future',scheduleId:dec.id,leaseId:lease.id,unitId:lease.unitId,status:'posted',amount:1000000});
 db.reminderNotifications.push({id:'notice-x',scheduleId:dec.id,leaseId:lease.id,unitId:lease.unitId,status:'unread',kind:'upcoming'});
 closeLease(db,lease,{effectiveOn:day,reason:'Thống nhất chấm dứt thuê trước thời hạn'},actor,day);
 assert.equal(db.reminderNotifications.at(-1).status,'resolved');
 assert.equal(dec.status,'open');
 // Advance the reminder window into December: no reminder for post-termination disputed debt.
 assert.equal(reminderQueue(db,'2026-12-23').some(s=>s.id===dec.id),false);
});
