import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyOwnerLink,submitOwnerChange,decideOwnerChange,ownerChangeRequests,ownerChangeInbox,OWNER_CORRECTION_FIELDS} from '../src/ownership.js';
import {bumpUnitRevision} from '../src/unit-revisions.js';
import {hasPermission} from '../src/security.js';

const admin={id:'adm',role:'admin',name:'Quản trị viên'};
const manager={id:'mgr',role:'manager',name:'Quản lý'};
const accountant={id:'acc',role:'accountant',name:'Kế toán'};
const fixture=()=>({
 users:[{id:'user-one',role:'viewer',status:'active',name:'Owner A'},
  {id:'user-two',role:'viewer',status:'active',name:'Owner B'}],
 clients:[{id:7,type:'owner',status:'active',name:'A',phone:'SECRET-PHONE'},{id:'07',type:'owner',status:'active',name:'B'}],
 projects:[],buildings:[],floors:[],rooms:[],staff:[],
 units:[{id:10,code:'U10',status:'vacant',ownerId:'7',address:'Old',area:72,bedrooms:2,interiorStatus:'partial',interiorNotes:'SECRET-STAFF-NOTE',feeBasis:'due',rent:26000000,deposit:52000000,feePercent:6,revision:2},
  {id:20,code:'U20',status:'vacant',ownerId:'07',address:'Elsewhere',area:81,bedrooms:2,interiorStatus:'furnished',feeBasis:'due',rent:10000000,revision:1}],
 leases:[],schedules:[],payments:[],audit:[]
});
const linked=()=>{const db=fixture();verifyOwnerLink(db,'user-one',7,admin);return db;};
const send=(db,field='area',value=74,reason='Diện tích đã được đo lại')=>submitOwnerChange(db,'user-one','10',{field,value,reason});

test('V2.69: verified owner can propose but never directly update shared unit or financial data',()=>{
 const db=linked(),before=structuredClone(db.units),request=send(db);
 assert.equal(request.status,'pending');assert.equal(request.value,74);assert.equal(request.previousValue,72);
 assert.deepEqual(db.units,before);
 assert.equal(db.users[0].role,'viewer');assert.equal(hasPermission(db.users[0],'unit.write'),false);
 assert.equal(ownerChangeRequests(db,db.users[0]).length,1);
 const serialized=JSON.stringify(ownerChangeRequests(db,db.users[0]));
 for(const fragment of ['SECRET-PHONE','SECRET-STAFF-NOTE','26000000','52000000','feePercent','rent','deposit'])assert.equal(serialized.includes(fragment),false,fragment);
});
test('V2.69: deny unverified user, different owner, and leading-zero identifier collision',()=>{
 const db=fixture();
 assert.throws(()=>send(db),{status:403});
 verifyOwnerLink(db,'user-one',7,admin);
 assert.throws(()=>submitOwnerChange(db,'user-one','20',{field:'area',value:85,reason:'Other owner'}),{status:403});
 verifyOwnerLink(db,'user-two','07',admin);
 assert.throws(()=>submitOwnerChange(db,'user-two','10',{field:'area',value:75,reason:'Other owner'}),{status:403});
});
test('V2.69: strict allowlist denies financial edits, internal notes, ownership changes and unexpected keys',()=>{
 const db=linked();
 for(const field of ['rent','deposit','feePercent','ownerId','managerId','leaseEnd','interiorNotes','__proto__']){
  assert.throws(()=>send(db,field,'fake'),{status:403},field);
 }
 assert.deepEqual(Object.keys(OWNER_CORRECTION_FIELDS).sort(),['address','area','bedrooms','interiorStatus'].sort());
 assert.throws(()=>submitOwnerChange(db,'user-one','10',{field:'area',value:74,reason:'x',deposit:1}),{status:400});
 assert.equal(db.users[0].ownerChangeRequests,undefined);
});
test('V2.69: rejected invalid numbers, unknown status, empty/oversized reason and unchanged values',()=>{
 const db=linked();
 assert.throws(()=>send(db,'bedrooms',1.5),{status:400});
 assert.throws(()=>send(db,'area',-3),{status:400});
 assert.throws(()=>send(db,'area',10001),{status:400});
 assert.throws(()=>send(db,'interiorStatus','luxury'),{status:400});
 assert.throws(()=>send(db,'area',72),{status:400});
 assert.throws(()=>send(db,'address',42),{status:400});
 assert.throws(()=>send(db,'address','A'.repeat(301)),{status:400});
 assert.throws(()=>send(db,'address','Updated',''),{status:400});
 assert.throws(()=>send(db,'address','Updated','x'.repeat(801)),{status:400});
});
test('V2.69: manager approval modifies only allowed field and increments version with audit',()=>{
 const db=linked(),snapshot=structuredClone(db.units[0]);
 const req=send(db,'address','  18 Phố Mới ','Địa chỉ cập nhật');
 assert.equal(ownerChangeInbox(db,manager).length,1);
 assert.throws(()=>ownerChangeInbox(db,accountant),{status:403});
 const result=decideOwnerChange(db,req.id,manager,'approve');
 assert.equal(result.status,'approved');
 assert.equal(db.units[0].address,'18 Phố Mới');assert.equal(db.units[0].revision,3);
 for(const key of ['rent','deposit','ownerId','feePercent','interiorNotes'])assert.deepEqual(db.units[0][key],snapshot[key]);
 assert.equal(db.users[0].ownerChangeRequests[0].status,'approved');
 assert.equal(ownerChangeInbox(db,manager).length,0);
 assert.equal(db.audit.some(a=>a.event==='owner_change.unit_updated'),true);
 assert.throws(()=>decideOwnerChange(db,req.id,admin,'approve'),{status:409});
});
test('V2.69: rejection never changes shared record; duplicate pending submission is blocked',()=>{
 const db=linked(),before=structuredClone(db.units[0]);
 const req=send(db);
 assert.throws(()=>send(db,'address','New street'),{status:409});
 assert.equal(decideOwnerChange(db,req.id,manager,'reject').status,'rejected');
 assert.deepEqual(db.units[0],before);
 assert.equal(send(db,'area',75).status,'pending');
});
test('V2.69: revoked/transfer/archived ownership prevents approval and hides private requests',()=>{
 for(const change of [db=>{db.units[0].ownerId='07'},db=>{db.clients[0].status='archived'},db=>{db.users[0].verifiedOwnerClientIds=[]},db=>{db.users[0].status='disabled'}]){
  const db=linked(),req=send(db);change(db);
  assert.equal(ownerChangeRequests(db,db.users[0]).length,0);
  assert.throws(()=>decideOwnerChange(db,req.id,manager,'approve'),{status:409});
  assert.equal(decideOwnerChange(db,req.id,manager,'reject').status,'rejected');
 }
});
test('V2.69: stale revision blocks approval and original unit is not overwritten',()=>{
 const db=linked(),request=send(db);
 db.units[0].address='Written by manager';bumpUnitRevision(db.units[0]);
 assert.throws(()=>decideOwnerChange(db,request.id,manager,'approve'),{status:409});
 assert.equal(db.units[0].area,72);assert.equal(db.users[0].ownerChangeRequests[0].status,'pending');
});
test('V2.69: actor cannot approve own proposal and role checks are enforced',()=>{
 const db=linked(),request=send(db);
 assert.throws(()=>decideOwnerChange(db,request.id,{id:'user-one',role:'manager'},'approve'),{status:403});
 assert.throws(()=>decideOwnerChange(db,request.id,accountant,'approve'),{status:403});
 assert.throws(()=>decideOwnerChange(db,request.id,manager,'delete'),{status:400});
 assert.equal(ownerChangeInbox(db,admin).length,1);
});

test('V2.69: malformed stored correction cannot be approved or exposed as a valid request',()=>{
 const db=linked(),req=send(db);
 db.users[0].ownerChangeRequests[0].value={phone:'PRIVATE'};
 assert.throws(()=>decideOwnerChange(db,req.id,manager,'approve'),{status:400});
 assert.equal(db.units[0].area,72);
 db.users[0].ownerChangeRequests[0].field='rent';
 assert.deepEqual(ownerChangeRequests(db,db.users[0]),[]);
 assert.deepEqual(ownerChangeInbox(db,manager),[]);
});
