import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertRecordRevision,bumpRecordRevision,recordRevision,updateRecordFields} from '../src/record-revisions.js';
import {mirrorLease} from '../src/lease-mirror.js';
import {closeLease,previewLeaseClosure} from '../src/lease-closure.js';
import {cleanClient} from '../src/client-validation.js';
import {leasePayload} from '../src/lease-identity.js';

const sample=()=>({
 projects:[],clients:[],staff:[],buildings:[],floors:[],rooms:[],
 units:[{id:'u1',status:'vacant',code:'A01',revision:3,feeBasis:'due',tenant:''}],
 leases:[],schedules:[],payments:[],depositTransactions:[],reminderNotifications:[],
 audit:[],preferences:{defaultFee:6}
});
const actor={id:'admin',name:'Admin'};

test('V2.81: client and lease revisions require numeric current version and reject stale edits',()=>{
 for(const label of ['Hồ sơ khách hàng','Hợp đồng']){
  const saved={id:'r1',name:'Before'};
  assert.equal(recordRevision(saved),0);
  assertRecordRevision(saved,0,label);
  assert.throws(()=>assertRecordRevision(saved,undefined,label),e=>e.status===428&&e.message.includes(label.toLowerCase()));
  bumpRecordRevision(saved);
  assert.equal(saved.revision,1);
  assert.match(saved.updatedAt,/^\d{4}-\d\d-\d\dT/);
  assert.throws(()=>assertRecordRevision(saved,0,label),e=>e.status===409&&e.message.includes(label));
  assert.throws(()=>assertRecordRevision(saved,'1',label),e=>e.status===400);
  assertRecordRevision(saved,1,label);
 }
});

test('V2.81: unchanged lease mirroring does not create false conflicts',()=>{
 const db=sample();const lease={id:'l1',unitId:'u1',tenantName:'Khách 01',rent:10000000,paymentDay:5,startsOn:'2026-11-01',endsOn:'2027-10-31',status:'active'};
 db.leases.push(lease);
 assert.equal(mirrorLease(db,lease),true);
 assert.equal(db.units[0].revision,4);
 assert.equal(db.units[0].status,'occupied');
 assert.equal(db.units[0].rent,10000000);
 assert.equal(mirrorLease(db,lease),false);
 assert.equal(db.units[0].revision,4);
 lease.tenantName='Khách 02';
 assert.equal(mirrorLease(db,lease),true);
 assert.equal(db.units[0].revision,5);
 assert.equal(db.units[0].tenant,'Khách 02');
 assert.throws(()=>assertRecordRevision(db.units[0],4,'Căn hộ'),e=>e.status===409);
});

test('V2.81: only latest active lease may keep occupied status after older lease ends',()=>{
 const db=sample();const original={id:'l1',unitId:'u1',status:'active',tenantName:'A',rent:12,paymentDay:1,startsOn:'2026-11-01',endsOn:'2026-11-30'};
 db.leases.push(original);mirrorLease(db,original);
 const next={...original,id:'l2',tenantName:'B',rent:15,startsOn:'2026-12-01',endsOn:'2027-11-30'};
 db.leases.push(next);mirrorLease(db,next);
 const version=db.units[0].revision;
 original.status='ended';
 assert.equal(mirrorLease(db,original),false);
 assert.equal(db.units[0].status,'occupied');
 assert.equal(db.units[0].revision,version);
 next.status='ended';
 assert.equal(mirrorLease(db,next),true);
 assert.equal(db.units[0].status,'ended');
 assert.equal(db.units[0].revision,version+1);
});

test('V2.81: early closure changes lease and unit versions while retaining paid historical records',()=>{
 const db=sample();db.leases.push({id:'l1',unitId:'u1',status:'active',startsOn:'2026-11-01',endsOn:'2027-03-31',rent:15000000,revision:2});
 db.units[0].status='occupied';
 db.schedules.push({id:'s1',leaseId:'l1',unitId:'u1',period:'2026-11',dueOn:'2026-11-05',amount:15000000,status:'open'},
  {id:'s2',leaseId:'l1',unitId:'u1',period:'2027-01',dueOn:'2027-01-05',amount:15000000,status:'open'});
 db.payments.push({id:'p1',leaseId:'l1',scheduleId:'s1',amount:5000000,status:'posted'});
 const input={effectiveOn:'2026-11-20',reason:'Đã bàn giao căn hộ'};
 const preview=previewLeaseClosure(db,db.leases[0],input,'2026-11-20');
 assert.equal(preview.cancelledCount,1);
 closeLease(db,db.leases[0],input,actor,'2026-11-20');
 assert.equal(db.leases[0].revision,3);
 assert.equal(db.units[0].revision,4);
 assert.equal(db.units[0].status,'ended');
 assert.equal(db.schedules.find(s=>s.id==='s2').status,'cancelled');
 assert.equal(db.payments[0].amount,5000000);
 assert.throws(()=>assertRecordRevision(db.leases[0],2,'Hợp đồng'),e=>e.status===409);
});

test('V2.81: record update only advances revision when mirrored values truly changed',()=>{
 const record={id:'r',revision:5,name:'Old'};
 assert.equal(updateRecordFields(record,{name:'Old'}),false);
 assert.equal(record.revision,5);
 assert.equal(updateRecordFields(record,{name:'New'}),true);
 assert.equal(record.revision,6);
});

test('V2.81: backend and React editor enforce revisions for client/lease while preserving unit guard',()=>{
 const api=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../../frontend/src/App.jsx',import.meta.url),'utf8');
 const smoke=readFileSync(new URL('../../scripts/smoke.mjs',import.meta.url),'utf8');
 assert.match(api,/revisioned:true,beforeDelete/);
 assert.match(api,/if\(revisioned\)assertRecordRevision\(row,req\.body\?\.expectedRevision,'Hồ sơ khách hàng'\)/);
 assert.match(api,/assertRecordRevision\(lease,req\.body\?\.expectedRevision,'Hợp đồng'\)/);
 assert.match(api,/mirrorLease\(db,lease\)/);
 assert.match(ui,/\['unit','client','lease'\]\.includes\(kind\)&&record\?\{expectedRevision:record\.revision\?\?0\}/);
 assert.match(smoke,/Client save\/reopen lost the new name/);
 assert.match(smoke,/Lease save\/reopen failed/);
});

test('V2.81: archive and restore advance revision so pre-archive editors cannot overwrite restored dossiers',async()=>{
 const {archiveRecord,restoreRecord}=await import('../src/lifecycle.js');
 const db=sample();db.clients.push({id:'c281',name:'Khách 281',type:'owner',status:'active',revision:1});
 db.units[0].revision=8;
 const archived=archiveRecord(db,'clients','c281',actor);
 assert.equal(archived.archived,true);
 assert.equal(db.clients[0].revision,2);
 assert.throws(()=>assertRecordRevision(db.clients[0],1,'Hồ sơ khách hàng'),e=>e.status===409);
 restoreRecord(db,'clients','c281',actor);
 assert.equal(db.clients[0].revision,3);
 assert.equal(db.clients[0].status,'active');
 assert.throws(()=>assertRecordRevision(db.clients[0],1,'Hồ sơ khách hàng'),e=>e.status===409);
 archiveRecord(db,'units','u1',actor);
 assert.equal(db.units[0].revision,9);
 restoreRecord(db,'units','u1',actor);
 assert.equal(db.units[0].revision,10);
});
