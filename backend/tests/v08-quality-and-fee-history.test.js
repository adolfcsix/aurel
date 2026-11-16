import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../src/seed.js';
import {upgrade} from '../src/store.js';
import {scanDataQuality} from '../src/data-quality.js';
import {hasPaymentHistory,paidFor} from '../src/domain.js';
import {simulateBulkUnits,commitBulkUnits} from '../src/bulk-units.js';
import {cleanUnit} from '../src/unit-validation.js';
import {previewLeaseClosure} from '../src/lease-closure.js';
const db=()=>upgrade(seed());
const actor={id:'qa-admin',name:'QA'};

test('V0.8: baseline seed has no false financial-integrity alerts',()=>{
 const report=scanDataQuality(db());assert.deepEqual(report.summary,{critical:0,warning:0,total:0,units:8,leases:7,schedules:89});
});
test('V0.8: optional draft fields do not produce an error',()=>{
 const s=db();s.units.push({id:'incomplete',code:'',projectId:'',buildingId:'',floor:'',status:'draft',feeBasis:'due',rent:null});
 assert.equal(scanDataQuality(s).summary.critical,0);
});
test('V0.8: missing project and building project mismatch are found',()=>{
 const s=db();s.units.find(x=>x.id==='u1').projectId='unknown';
 const codes=scanDataQuality(s).issues.map(x=>x.code);
 assert.ok(codes.includes('MISSING_PROJECT'));assert.ok(codes.includes('BUILDING_PROJECT_MISMATCH'));
});
test('V0.8: duplicate unit codes are scoped to project and tower',()=>{
 const s=db();const u=s.units.find(x=>x.id==='u2');s.units.push({...u,id:'u-duplicate'});
 assert.ok(scanDataQuality(s).issues.some(x=>x.code==='DUPLICATE_UNIT'));
});
test('V0.8: overlapping active leases in the same apartment are detected',()=>{
 const s=db();const l=s.leases.find(x=>x.unitId==='u2');s.leases.push({...l,id:'lease-extra'});
 assert.ok(scanDataQuality(s).issues.some(x=>x.code==='OVERLAPPING_LEASE'));
});
test('V0.8: overpaid schedules and cancelled schedules with receipts are detected',()=>{
 const s=db(),sch=s.schedules.find(x=>x.unitId==='u2'&&x.period==='2026-11');
 s.payments.push({id:'bad-overpay',unitId:sch.unitId,leaseId:sch.leaseId,scheduleId:sch.id,status:'posted',amount:sch.amount});
 const codes=scanDataQuality(s).issues.map(x=>x.code);assert.ok(codes.includes('OVERPAID_SCHEDULE'));
 sch.status='cancelled';assert.ok(scanDataQuality(s).issues.some(x=>x.code==='PAID_CANCELLED_SCHEDULE'));
});
test('V0.8: orphan payment and mismatched contract reference are reported',()=>{
 const s=db();s.payments.push({id:'orphan',scheduleId:'none',unitId:'u1',leaseId:'none',status:'posted',amount:50000});
 s.payments.find(x=>x.id==='pay1').leaseId='wrong';
 const codes=scanDataQuality(s).issues.map(x=>x.code);
 assert.ok(codes.includes('ORPHAN_PAYMENT'));assert.ok(codes.includes('PAYMENT_LINK_MISMATCH'));
});
test('V0.8: negative deposit and over-approved refund are detected',()=>{
 const s=db(),l=s.leases.find(l=>l.unitId==='u2');
 s.depositTransactions.push({id:'wrong-refund',leaseId:l.id,unitId:l.unitId,kind:'settle',amount:20000000});
 s.depositSettlements.push({id:'approval',leaseId:l.id,unitId:l.unitId,status:'approved',refund:100000,deduction:0});
 const codes=scanDataQuality(s).issues.map(x=>x.code);
 assert.ok(codes.includes('NEGATIVE_DEPOSIT'));assert.ok(codes.includes('STALE_DEPOSIT_APPROVAL'));
});
test('V0.8: integrity scan never changes the source dataset',()=>{
 const s=db(),initial=structuredClone(s);
 scanDataQuality(s);assert.deepEqual(s,initial);
});
test('V0.8: scan is capped but total counts include all issues',()=>{
 const s=db();for(let i=0;i<20;i++)s.units.push({id:'bad-'+i,projectId:'missing',status:'draft',feeBasis:'due'});
 const report=scanDataQuality(s,{limit:5});assert.equal(report.issues.length,5);assert.ok(report.summary.total>5);assert.equal(report.truncated,true);
});
test('V0.8: changing a fee never reprices a reversed-receipt period',()=>{
 const s=db();const month=s.schedules.find(x=>x.unitId==='u2'&&x.period==='2026-11');
 const receipt=s.payments.find(x=>x.scheduleId===month.id);assert.ok(receipt);
 receipt.status='reversed';assert.equal(paidFor(s,month.id),0);assert.equal(hasPaymentHistory(s,month.id),true);
 const oldFee=month.feePercent;
 const change={ids:['u2'],changes:{feePercent:3.25},feeEffectiveFrom:'2026-11-11',feeReason:'Điều chỉnh đúng phạm vi'};
 const preview=simulateBulkUnits(s,change,cleanUnit,{day:'2026-11-11'});
 commitBulkUnits(s,{...change,fingerprint:preview.fingerprint},cleanUnit,actor,{day:'2026-11-11'});
 assert.equal(month.feePercent,oldFee);
 assert.equal(s.units.find(x=>x.id==='u2').feePercent,3.25);
});

test('V0.8: an active lease cannot be terminated before its start date',()=>{
 const s=db(),l=s.leases.find(x=>x.unitId==='u2');
 assert.throws(()=>previewLeaseClosure(s,l,{effectiveOn:'2025-12-31'},'2026-11-11'),/trước ngày bắt đầu/);
});
