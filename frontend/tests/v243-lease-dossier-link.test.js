import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clientLeaseLinks,clientUnitLinks} from '../src/lib/dossier-relations.js';
import {clientProfileView} from '../src/lib/client-profile.js';
import {leaseEssentials} from '../src/lib/dossier-essentials.js';

const db={
 clients:[{id:'c1',name:'Khách có hồ sơ',type:'tenant'}, {id:'c2',name:'Khách khác',type:'tenant'}],
 projects:[],buildings:[],units:[{id:'u1',code:'A-01',ownerId:'c2',tenantId:''},{id:'u2',code:'A-02',ownerId:'c2',tenantId:''}],
 leases:[{id:'l1',unitId:'u1',tenantId:'c1',tenantName:'Tên khác',status:'active'},
  {id:'l2',unitId:'u2',tenantName:'Khách có hồ sơ',status:'ended'},
  {id:'l3',unitId:'u2',tenantId:'c2',tenantName:'Khách có hồ sơ',status:'active'},
  {id:'l4',unitId:'u2',tenantId:'c1',status:'archived'}],
 schedules:[],depositSettlements:[],depositTransactions:[]
};
const source=file=>readFileSync(new URL('../src/'+file,import.meta.url),'utf8');

test('v243 joins by tenantId, not tenantName or unit owner, and excludes archived contract',()=>{
 assert.deepEqual(clientLeaseLinks(db,'c1').verified.map(x=>x.id),['l1']);
 assert.equal(clientLeaseLinks(db,'c2').verified[0].id,'l3');
 assert.equal(clientLeaseLinks(db,'missing').verified.length,0);
 assert.deepEqual(clientUnitLinks(db,'c1').rented.map(x=>x.id),['u1']);
 assert.deepEqual(clientProfileView(db,db.clients[0]).verified.map(x=>x.id),['l1']);
 assert.deepEqual(clientProfileView(db,db.clients[1]).possible.map(x=>x.id),['l1','l2']);
});

test('v243 lease details expose linked client only through persisted ID and keep legacy unlinked',()=>{
 assert.equal(leaseEssentials(db,db.leases[0]).tenantProfile.id,'c1');
 assert.equal(leaseEssentials(db,db.leases[0]).tenantIdentityVerified,true);
 assert.equal(leaseEssentials(db,db.leases[1]).tenantProfile,null);
 assert.equal(leaseEssentials(db,db.leases[1]).tenantIdentityVerified,false);
});

test('v243 editing and dossiers expose optional reference with permission gating and honest copy',()=>{
 const app=source('App.jsx'),client=source('components/ClientDossier.jsx'),lease=source('components/LeaseDossier.jsx');
 assert.match(app,/label:'Liên kết hồ sơ khách thuê'/);
 assert.match(app,/onOpenClient=\{id=>viewDossier\('client',id\)\}/);
 assert.match(lease,/can\('client.read'\)\|\|can\('client.write'\)/);
 assert.match(lease,/tenantProfile&&/);
 assert.match(client,/verified\.length>0/);
 assert.match(client,/chưa xác nhận người thuê bằng mã hồ sơ/);
 assert.doesNotMatch(client,/tenantName\s*===\s*client\.name|client\.name\s*===\s*tenantName/);
});
