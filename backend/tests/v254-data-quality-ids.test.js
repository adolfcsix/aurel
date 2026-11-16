import test from 'node:test';
import assert from 'node:assert/strict';
import {scanDataQuality} from '../src/data-quality.js';

const state=()=>({
 projects:[{id:1,status:'active'}],
 buildings:[{id:2,projectId:'1',code:'A',status:'active'}],
 floors:[{id:3,buildingId:'2',projectId:1,code:'02',status:'active'}],
 rooms:[{id:4,floorId:'3',buildingId:2,code:'03',status:'active'}],
 units:[{id:8,code:'A-203',projectId:'1',buildingId:'2',floorId:'3',roomId:'4',ownerId:'5',tenantId:'6',managerId:'7',status:'occupied',feePercent:6}],
 staff:[{id:7,status:'active'}],clients:[{id:5,type:'owner',status:'active'},{id:6,type:'tenant',status:'active'}],
 leases:[{id:9,unitId:'8',tenantId:'6',startsOn:'2026-11-01',endsOn:'2026-12-31',rent:1000,status:'active'}],
 schedules:[{id:10,leaseId:'9',unitId:8,period:'2026-11',dueOn:'2026-11-05',amount:1000,feePercent:6,status:'open'}],
 payments:[{id:11,scheduleId:'10',leaseId:9,unitId:'8',amount:300,status:'posted'}],
 depositTransactions:[],depositSettlements:[],feeHistory:[{id:12,unitId:'8',effectiveFrom:'2026-11-01'}],
 paymentAttachments:[{id:13,paymentId:'11'}],preferences:{}
});
const codes=db=>scanDataQuality(db).issues.map(x=>x.code);
test('V2.54: data quality accepts identical persisted IDs across numeric/string relationships',()=>{
 const report=scanDataQuality(state());
 assert.equal(report.summary.critical,0,JSON.stringify(report.issues));
 assert.equal(report.summary.warning,0,JSON.stringify(report.issues));
});
test('V2.54: data quality still flags genuine orphaned room references',()=>{
 const d=state();d.units[0].roomId='004';
 assert.ok(codes(d).includes('MISSING_ROOM'));
});
test('V2.54: duplicate unit codes are detected even when project/building IDs differ by type',()=>{
 const d=state();d.units.push({...d.units[0],id:'second',projectId:1,buildingId:2});
 assert.ok(codes(d).includes('DUPLICATE_UNIT'));
});
test('V2.54: genuinely mismatched schedule payment relation remains critical',()=>{
 const d=state();d.payments[0].leaseId='009';
 assert.ok(codes(d).includes('PAYMENT_LINK_MISMATCH'));
});
test('V2.54: leading-zero client identifier is not normalized into a different client',()=>{
 const d=state();d.units[0].tenantId='06';
 assert.ok(codes(d).includes('INACTIVE_CLIENT'));
});
test('V2.54: active overlapping leases are detected across numeric and string unit identifiers',()=>{
 const d=state();d.leases.push({id:'new-lease',unitId:8,startsOn:'2026-11-15',endsOn:'2027-01-01',rent:1000,status:'active'});
 assert.ok(codes(d).includes('OVERLAPPING_LEASE'));
});
