import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scoped,assignedToStaff,hasAssignedUnit} from '../src/state-access.js';
import {samePersistedId} from '../src/domain.js';

const db=()=>({
 projects:[{id:7,name:'Hợp lệ'},{id:'07',name:'Khác mã'}],
 buildings:[{id:3,projectId:7},{id:'03',projectId:'07'}],
 floors:[{id:8,projectId:'7'},{id:'08',projectId:'07'}],rooms:[],
 units:[
  {id:11,projectId:'7',managerId:2,ownerId:101,tenantId:'',code:'A11'},
  {id:'12',projectId:7,saleId:'2',tenantId:102,code:'A12'},
  {id:'013',projectId:'07',managerId:'02',ownerId:103,code:'B13'},
  {id:14,projectId:'07',managerId:3,ownerId:104,code:'B14'}],
 leases:[
  {id:21,unitId:'11',tenantId:'105',status:'active'},
  {id:'22',unitId:12,tenantId:'106',status:'archived'},
  {id:23,unitId:14,tenantId:'107',status:'active'}],
 schedules:[{id:31,unitId:'11',leaseId:'21'},{id:32,unitId:12,leaseId:22},{id:33,unitId:14,leaseId:23}],
 payments:[{id:41,scheduleId:'31'},{id:42,scheduleId:32},{id:43,scheduleId:'33'}],
 reminderContacts:[{id:51,scheduleId:31},{id:52,scheduleId:33}],
 reminderNotifications:[{id:61,scheduleId:'32'},{id:62,scheduleId:33}],
 clients:[101,102,103,104,105,106,107].map(id=>({id,name:'Client'+id})),
 staff:[{id:2,name:'Assigned',email:'private@example.test'},{id:3,name:'Other'}],
 depositTransactions:[{id:1,amount:700}],depositSettlements:[{id:1}],feeHistory:[{id:1}],
 audit:[{event:'private'}],users:[{passwordHash:'sensitive'}],sessions:[{csrf:'secret'}],
 paymentAttachments:[],preferences:{company:'AUREL',reminderDays:5}
});
const user=(role,staffId='2')=>({user:{role,staffId}});

test('V2.46 stored IDs treat 7 and "7" as one, but keep 07 distinct',()=>{
 assert.equal(samePersistedId(7,'7'),true);
 assert.equal(samePersistedId(' 7 ',7),true);
 assert.equal(samePersistedId(7,'07'),false);
 for(const value of [null,undefined,'','  ',Number.NaN,Infinity])assert.equal(samePersistedId(value,7),false);
});

test('V2.46 assignment checker does not treat empty staff IDs as a match',()=>{
 const units=[{id:1,managerId:null,saleId:''},{id:'02',managerId:'02'},{id:2,managerId:2}];
 assert.equal(assignedToStaff(units[0],null),false);
 assert.equal(assignedToStaff(units[0],''),false);
 assert.equal(hasAssignedUnit(units,'1',null),false);
 assert.equal(hasAssignedUnit(units,'2','2'),true);
 assert.equal(hasAssignedUnit(units,'02','2'),false);
 assert.equal(hasAssignedUnit(units,'02','02'),true);
 assert.equal(hasAssignedUnit(units,'2','02'),false);
});

test('V2.46 staff scope joins imported cross-type IDs without widening portfolio',()=>{
 const input=db(),before=structuredClone(input);
 const view=scoped(user('staff'),input);
 assert.deepEqual(view.units.map(x=>x.id),[11,'12']);
 assert.deepEqual(view.projects.map(x=>x.id),[7]);
 assert.deepEqual(view.buildings.map(x=>x.id),[3]);
 assert.deepEqual(view.floors.map(x=>x.id),[8]);
 assert.deepEqual(view.leases.map(x=>x.id),[21,'22']);
 assert.deepEqual(view.schedules.map(x=>x.id),[31,32]);
 assert.deepEqual(view.payments.map(x=>x.id),[41,42]);
 assert.deepEqual(view.reminderContacts.map(x=>x.id),[51]);
 assert.deepEqual(view.reminderNotifications.map(x=>x.id),[61]);
 assert.deepEqual(view.clients.map(x=>x.id),[101,102,105]);
 assert.equal(view.staff[0].email,undefined);
 for(const name of ['depositTransactions','depositSettlements','feeHistory','users','sessions','audit'])assert.deepEqual(view[name],[]);
 assert.deepEqual(input,before,'scoping never modifies the database');
});

test('V2.46 staff without assigned staff ID receives no portfolio data',()=>{
 for(const staffId of [null,undefined,'']){
  const view=scoped({user:{role:'staff',staffId}},db());
  for(const name of ['units','projects','leases','payments','schedules','clients'])assert.deepEqual(view[name],[]);
 }
});

test('V2.46 unknown or missing role is denied, not projected as manager',()=>{
 for(const role of ['supervisor',undefined,''])assert.throws(()=>scoped(user(role),db()),e=>e.status===403);
});

test('V2.46 admin and manager retain full state; viewer remains allowlist-only',()=>{
 const input=db();
 assert.strictEqual(scoped(user('admin'),input),input);
 assert.strictEqual(scoped(user('manager'),input),input);
 const viewer=scoped(user('viewer'),input);
 assert.equal(viewer.units.length,4);
 assert.equal(viewer.units[0].ownerId,'');
 assert.equal(JSON.stringify(viewer).includes('Client101'),false);
});

test('V2.46 both staff reminder write guards use the same assignment helper as reads',()=>{
 const src=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 assert.match(src,/!hasAssignedUnit\(db\.units,n\.unitId,req\.user\.staffId\)/);
 assert.match(src,/!hasAssignedUnit\(db\.units,sch\.unitId,req\.user\.staffId\)/);
});
