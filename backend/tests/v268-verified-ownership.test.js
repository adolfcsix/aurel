import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyOwnerLink,revokeOwnerLink,ownedUnitCount,verifiedOwnedUnits,saveOwnedUnitNote} from '../src/ownership.js';
import {requestWorkspaceAccount} from '../src/account-onboarding.js';
import {hasPermission} from '../src/security.js';
const admin={id:'admin',name:'Admin',role:'admin'};
const fixture=()=>({
 users:[{id:'u',role:'viewer',status:'active',username:'viewer',name:'Người xem',favoriteUnitIds:['10']},{id:'other',role:'viewer',status:'active'}],
 clients:[{id:7,type:'owner',name:'Owner A',phone:'PRIVATE-PHONE'},{id:'07',type:'owner',name:'Owner B'},{id:8,type:'tenant',name:'Tenant'},{id:9,type:'owner',status:'archived',name:'Archived'}],
 units:[{id:10,code:'A10',ownerId:'7',status:'vacant',area:66,bedrooms:2,rent:20000000,deposit:10000000,notes:'PRIVATE-NOTES',tenant:'PRIVATE-TENANT'},
  {id:'20',code:'B20',ownerId:'07',status:'occupied',rent:30000000},
  {id:30,code:'C30',ownerId:8,status:'vacant'},
  {id:40,code:'D40',ownerId:7,status:'archived'}],audit:[]
});
test('V2.68: favorites or matching name alone cannot establish ownership',()=>{
 const db=fixture();
 assert.equal(ownedUnitCount(db,db.users[0]),0);assert.deepEqual(verifiedOwnedUnits(db,db.users[0]),[]);
 for(const p of ['unit.write','client.write','payment.write','deposit.write','settings.write'])assert.equal(hasPermission(db.users[0],p),false);
});
test('V2.68: only admin can link; tenant and archived clients rejected; role unchanged',()=>{
 const db=fixture();
 assert.throws(()=>verifyOwnerLink(db,'u',7,{id:'u',role:'viewer'}),{status:403});
 assert.throws(()=>verifyOwnerLink(db,'u',8,admin),{status:409});
 assert.throws(()=>verifyOwnerLink(db,'u',9,admin),{status:404});
 assert.equal(verifyOwnerLink(db,'u','7',admin).verifiedOwnerClientIds.length,1);
 assert.equal(verifyOwnerLink(db,'u',7,admin).verifiedOwnerClientIds.length,1,'idempotent mixed numeric/string id');
 assert.equal(db.users[0].role,'viewer');
 assert.equal(ownedUnitCount(db,db.users[0]),1);
 assert.deepEqual(verifiedOwnedUnits(db,db.users[0]).map(x=>x.code),['A10']);
 assert.equal(db.audit.filter(x=>x.event==='ownership.verified').length,1);
});
test('V2.68: owner payload is allowlisted without private financial/customer data',()=>{
 const db=fixture();verifyOwnerLink(db,'u',7,admin);
 const payload=verifiedOwnedUnits(db,db.users[0]);const wire=JSON.stringify(payload);
 assert.equal(payload[0].area,66);assert.equal(payload[0].personalNote,'');
 for(const forbidden of ['PRIVATE-PHONE','PRIVATE-TENANT','PRIVATE-NOTES','rent','deposit','tenant','phone','clientId'])assert.equal(wire.includes(forbidden),false,forbidden);
 assert.deepEqual(Object.keys(payload[0]).sort(),['id','code','projectId','building','floor','room','address','area','bedrooms','interiorStatus','status','personalNote'].sort());
});
test('V2.68: owner may edit only a personal note; other accounts and shared unit are unchanged',()=>{
 const db=fixture();verifyOwnerLink(db,'u',7,admin);
 const baseline=structuredClone(db.units),other=structuredClone(db.users[1]);
 assert.throws(()=>saveOwnedUnitNote(db,'other',10,'spoof'),{status:403});
 assert.throws(()=>saveOwnedUnitNote(db,'u','20','other owner'),{status:403});
 assert.throws(()=>saveOwnedUnitNote(db,'u','10','x'.repeat(501)),{status:400});
 assert.throws(()=>saveOwnedUnitNote(db,'u','10',{note:'malformed'}),{status:400});
 assert.deepEqual(saveOwnedUnitNote(db,'u',10,'  Ghi chú riêng  '),{unitId:10,note:'Ghi chú riêng'});
 assert.equal(verifiedOwnedUnits(db,db.users[0])[0].personalNote,'Ghi chú riêng');
 assert.deepEqual(db.units,baseline);assert.deepEqual(db.users[1],other);
 assert.equal(saveOwnedUnitNote(db,'u','10','').note,'');
});
test('V2.68: transfer, archive, disable and revocation remove access immediately',()=>{
 const db=fixture();verifyOwnerLink(db,'u',7,admin);
 db.units[0].ownerId='07';assert.equal(ownedUnitCount(db,db.users[0]),0,'07 distinct from 7');
 db.units[0].ownerId=7;db.clients[0].status='archived';assert.equal(ownedUnitCount(db,db.users[0]),0);
 db.clients[0].status='active';db.units[0].status='archived';assert.equal(ownedUnitCount(db,db.users[0]),0);
 db.units[0].status='vacant';db.users[0].status='disabled';assert.equal(ownedUnitCount(db,db.users[0]),0);
 db.users[0].status='active';assert.equal(ownedUnitCount(db,db.users[0]),1);
 assert.throws(()=>revokeOwnerLink(db,'u',7,{role:'manager'}),{status:403});
 revokeOwnerLink(db,'u','7',admin);assert.equal(ownedUnitCount(db,db.users[0]),0);
 assert.throws(()=>saveOwnedUnitNote(db,'u',10,'not allowed'),{status:403});
});
test('V2.68: registration cannot self-assert owner verification',()=>{
 const db={users:[],audit:[]};
 assert.throws(()=>requestWorkspaceAccount(db,{username:'someone',name:'Some One',password:'abc123456789',verifiedOwnerClientIds:[7]}),{status:400});
 assert.equal(db.users.length,0);
});
