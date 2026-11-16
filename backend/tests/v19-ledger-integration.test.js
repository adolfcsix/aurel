/**
 * Dependency-free cross-module integration against the actual JSON demo store.
 * Tests serialization, rollback, fee snapshots, lease closure and maker-checker
 * deposit settlement WITHOUT claiming that Express or PostgreSQL were exercised.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {cleanUnit} from '../src/unit-validation.js';
import {create,businessDate,generateSchedules,paidFor,depositBalance,feeFor} from '../src/domain.js';
import {applyUnitFeePolicy,resolvedFeePercent} from '../src/fee-policy.js';
import {postRentPayment} from '../src/payment-operations.js';
import {previewLeaseClosure,closeLease} from '../src/lease-closure.js';
import {submitDepositProposal,approveDepositProposal,executeDepositProposal} from '../src/deposit-approvals.js';
import {simulateBulkUnits,commitBulkUnits} from '../src/bulk-units.js';

const tmp=mkdtempSync(path.join(tmpdir(),'aurel-v19-ledger-'));
process.env.AUREL_DEMO_DATA_DIR=tmp;
process.env.AUREL_STORAGE='json';
const {getDb,updateDb,resetDb}=await import('../src/store.js');
const admin={id:'qa-v19-admin',name:'QA Admin'};
const approver={id:'qa-v19-manager',name:'QA Approver'};
const executor={id:'qa-v19-accountant',name:'QA Accountant'};
const day=businessDate();
const year=Number(day.slice(0,4)), nextYear=year+1;
const firstNextMonth=(()=>{const d=new Date(`${day.slice(0,7)}-01T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+1);return d.toISOString().slice(0,10)})();
const unitId=randomUUID(),leaseId=randomUUID();

test('V1.9: blank numeric fields stay unset and cannot be confused with 0 VND',async()=>{
 await resetDb();
 const db=await getDb();
 const draft=cleanUnit({code:'QA V19 DRAFT',rent:'   ',feePercent:' ',deposit:' '},db,{id:unitId,status:'draft',feeBasis:'due'});
 assert.equal(draft.rent,null);assert.equal(draft.feePercent,null);assert.equal(draft.deposit,null);
 assert.throws(()=>cleanUnit({rent:true},db,draft),/không hợp lệ/);
 assert.throws(()=>cleanUnit({deposit:[]},db,draft),/không hợp lệ/);
});

test('V1.9: clearing fee override inherits configured default, preserving received periods',async()=>{
 assert.equal(resolvedFeePercent(null,{defaultFee:6}),6);
 const s=await getDb(),unit=s.units.find(u=>u.id==='u2');
 const before={...unit},after={...unit,feePercent:null};
 const paidMonth=s.schedules.find(x=>x.unitId===unit.id&&x.period==='2026-11');
 const oldSnapshot=paidMonth.feePercent;
 const later=s.schedules.find(x=>x.unitId===unit.id&&x.dueOn>=firstNextMonth&&x.status==='open');
 assert.ok(later,'Expected a future unpaid schedule');
 const result=applyUnitFeePolicy(s,{unitId:unit.id,before,after,effectiveFrom:day,reason:'Quay lại phí công ty',actorId:admin.id});
 assert.equal(result.policy.percent,6);assert.equal(result.policy.inheritedDefault,true);
 assert.equal(paidMonth.feePercent,oldSnapshot,'Paid schedule must be immutable');
 assert.equal(later.feePercent,6,'Inherited default must not become 0%');
 assert.equal(feeFor(s,later),Math.round(later.amount*0.06));
 // Dry-run against local fixture; changes above were not persisted.
 const bulkRequest={ids:[unit.id],changes:{feePercent:null},feeEffectiveFrom:day,feeReason:'Chuyển về mức phí mặc định'};
 const simulation=simulateBulkUnits(await getDb(),bulkRequest,cleanUnit,{day});
 const bulkTarget=simulation.simulated.feeHistory.at(-1);
 assert.equal(bulkTarget.percent,6);
 assert.equal(bulkTarget.inheritedDefault,true);
});

test('V1.9: cross-transaction rent → receipt → closure → approved deposit settlement',async()=>{
 await updateDb(db=>{
  const project=create({name:'QA V19 Residential',city:'Hà Nội'});
  db.projects.push(project);
  const building=create({projectId:project.id,code:'QA-T',name:'QA Tower'});
  db.buildings.push(building);
  const u=cleanUnit({code:'QA-1901',projectId:project.id,buildingId:building.id,floor:'19',room:'01',rent:10000000,feePercent:4,feeBasis:'paid',status:'occupied'},db,{id:unitId,status:'draft',feeBasis:'due'});
  db.units.push(u);
  const l=create({id:leaseId,unitId,tenantName:'QA Tenant',startsOn:`${year}-01-01`,endsOn:`${nextYear}-12-31`,paymentDay:1,rent:10000000,depositExpected:20000000,status:'active'});
  db.leases.push(l);
  generateSchedules(db,l);
  db.depositTransactions.push(create({leaseId,unitId,kind:'receive',amount:20000000,date:day,by:admin.id}));
 });
 const state1=await getDb();
 const period=state1.schedules.find(s=>s.leaseId===leaseId&&s.period===day.slice(0,7));
 assert.ok(period,'Current monthly schedule must exist');
 const receipt=await updateDb(db=>postRentPayment(db,{scheduleId:period.id,amount:4000000,date:day,idempotencyKey:'qa-v19-one-receipt'},admin,day));
 const replay=await updateDb(db=>postRentPayment(db,{scheduleId:period.id,amount:4000000,date:day,idempotencyKey:'qa-v19-one-receipt'},admin,day));
 assert.equal(replay.id,receipt.id);
 assert.equal(paidFor(await getDb(),period.id),4000000);
 await updateDb(db=>{
  const l=db.leases.find(x=>x.id===leaseId);
  const preview=previewLeaseClosure(db,l,{effectiveOn:day},day);
  assert.ok(preview.cancelledCount>0);
  closeLease(db,l,{effectiveOn:day,reason:'Đã bàn giao căn hộ'},admin,day);
 });
 const proposal=await updateDb(db=>submitDepositProposal(db,leaseId,{refund:18000000,deduction:2000000,note:'Đối trừ được các bên xác nhận'},admin));
 await assert.rejects(()=>updateDb(db=>approveDepositProposal(db,proposal.id,admin)),/tự duyệt/);
 await updateDb(db=>approveDepositProposal(db,proposal.id,approver));
 const settled=await updateDb(db=>executeDepositProposal(db,proposal.id,executor,{reference:'QA-V19-REFUND-0001'},day));
 assert.equal(settled.refund,18000000);
 assert.equal(depositBalance(await getDb(),leaseId),0);
 const replaySettle=await updateDb(db=>executeDepositProposal(db,proposal.id,executor,{reference:'QA-V19-REFUND-0001'},day));
 assert.equal(replaySettle.id,settled.id);
 const settledState=await getDb();
 assert.ok(settledState.payments.some(p=>p.id===receipt.id));
 assert.equal(settledState.payments.filter(p=>p.idempotencyKey==='qa-v19-one-receipt').length,1);
});

test('V1.9: serialized writes survive concurrency and failed edits roll back on disk',async()=>{
 const file=path.join(tmp,'local-demo.json');
 await Promise.all(Array.from({length:8},(_,i)=>updateDb(async db=>{
  await new Promise(r=>setTimeout(r,(i%3)*2));
  db.preferences[`v19QaFlag${i}`]=i;
 })));
 const db=await getDb();
 for(let i=0;i<8;i++)assert.equal(db.preferences[`v19QaFlag${i}`],i);
 const before=readFileSync(file,'utf8');
 await assert.rejects(()=>updateDb(db=>{
  db.preferences.company='SHOULD NOT COMMIT';
  throw new Error('intentional rollback');
 }),/intentional rollback/);
 assert.equal(readFileSync(file,'utf8'),before);
 assert.notEqual((await getDb()).preferences.company,'SHOULD NOT COMMIT');
});

// The temporary demo store is disposable; it is never the user's actual dataset.
process.on('exit',()=>{try{rmSync(tmp,{recursive:true,force:true})}catch{}});
