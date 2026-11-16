import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {leasePayload} from '../src/lease-identity.js';
import {cleanClient} from '../src/client-validation.js';
import {scoped} from '../src/state-access.js';
import {scanDataQuality} from '../src/data-quality.js';
import {restoreRecord,archiveRecord} from '../src/lifecycle.js';

const store=()=>({
 clients:[{id:'t-1',name:'Minh Anh',type:'tenant',status:'active'},
  {id:'t-2',name:'Hải',type:'both',status:'active'},
  {id:'owner',name:'Chủ',type:'owner',status:'active'},
  {id:'archived',name:'Đã lưu trữ',type:'tenant',status:'archived'}],
 units:[{id:'u1',code:'A-01',projectId:'p1',managerId:'s1',tenantId:'',status:'occupied'},
  {id:'u2',code:'B-02',projectId:'p1',managerId:'s2',tenantId:'',status:'occupied'}],
 leases:[],projects:[{id:'p1',name:'AUREL'}],buildings:[],floors:[],rooms:[],
 staff:[],schedules:[],payments:[],paymentAttachments:[],depositTransactions:[],depositSettlements:[],
 feeHistory:[],reminderContacts:[],reminderNotifications:[],users:[],sessions:[],audit:[],
 preferences:{company:'AUREL',reminderDays:5,defaultFee:6}
});
const base={unitId:'u1',tenantName:'Nguyễn Minh Anh',startsOn:'2026-01-01',endsOn:'2027-01-01',status:'draft'};

test('v243 optional persisted reference accepts tenant/both without mutating historic free-text name',()=>{
 const db=store(),out=leasePayload({...base,tenantId:'t-1'},db,{id:'l1'});
 assert.equal(out.tenantId,'t-1');assert.equal(out.tenantName,'Nguyễn Minh Anh');
 assert.equal(leasePayload({...base,tenantId:'t-2'},db,{id:'l2'}).tenantId,'t-2');
 const old=leasePayload(base,db,{id:'legacy'});
 assert.equal(old.tenantId,undefined);
 assert.equal(old.tenantName,base.tenantName);
 assert.equal(leasePayload({...old,rent:10000000,paymentDay:5},db,old).tenantId,undefined);
});

test('v243 rejects invalid/unavailable customer references and accepts explicit unlink',()=>{
 const db=store();for(const id of ['owner','archived','unknown']){
  assert.throws(()=>leasePayload({...base,tenantId:id},db,{id:'new'}),error=>[404,409].includes(error.status),id);
 }
 const linked={id:'old',...base,tenantId:'t-1'};
 assert.equal(leasePayload({...linked,tenantId:''},db,linked).tenantId,'');
});

test('v243 role downgrade cannot silently invalidate archived or active contract links',()=>{
 const db=store();db.leases.push({id:'l1',unitId:'u1',tenantId:'t-1',status:'ended'});
 assert.throws(()=>cleanClient({type:'owner'},db,db.clients[0]),error=>error.status===409);
 assert.equal(cleanClient({type:'both'},db,db.clients[0]).type,'both');
});

test('v243 privacy projection hides reference from viewers and scopes staff by assigned leases',()=>{
 const db=store();db.leases=[{id:'l1',unitId:'u1',tenantId:'t-1',tenantName:'Minh Anh',status:'active'},
  {id:'l2',unitId:'u2',tenantId:'t-2',tenantName:'Hải',status:'active'}];
 const viewer=scoped({user:{role:'viewer'}},db);
 assert.equal(Object.hasOwn(viewer.leases[0],'tenantId'),false);
 assert.equal(viewer.clients.length,0);
 const staff=scoped({user:{role:'staff',staffId:'s1'}},db);
 assert.deepEqual(staff.leases.map(x=>x.id),['l1']);
 assert.deepEqual(staff.clients.map(x=>x.id),['t-1']);
 assert.equal(staff.clients.some(x=>x.id==='t-2'),false);
});

test('v243 integrity flags broken links by ID without exposing names',()=>{
 const db=store();db.leases=[{id:'l1',unitId:'u1',tenantId:'missing',status:'active',startsOn:'2026-01-01',endsOn:'2027-01-01',rent:10000000},
  {id:'l2',unitId:'u2',tenantId:'owner',status:'draft'}];
 const check=scanDataQuality(db);
 assert.ok(check.issues.some(x=>x.code==='LEASE_TENANT_REFERENCE'&&x.id==='l1'));
 assert.ok(check.issues.some(x=>x.code==='LEASE_TENANT_ROLE'&&x.id==='l2'));
 assert.equal(JSON.stringify(check).includes('Minh Anh'),false);
});

test('v243 restoring a contract validates its existing customer ID',()=>{
 const db=store(),user={id:'admin'};
 db.leases=[{id:'l1',unitId:'u1',tenantId:'archived',status:'archived',archiveMeta:{status:'ended'}}];
 assert.throws(()=>restoreRecord(db,'leases','l1',user),e=>e.status===404);
 assert.equal(db.leases[0].status,'archived');
 db.leases[0].tenantId='t-2';
 assert.equal(restoreRecord(db,'leases','l1',user).status,'ended');
});

test('v243 renewal copies explicit tenantId instead of resolving name',()=>{
 const src=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 assert.match(src,/tenantId:old\.tenantId\|\|''/);
 assert.match(src,/import \{leasePayload(?:,[^}]+)?\} from '\.\/lease-identity\.js'/);
});

test('v243 an archived-only lease does not widen staff client scope',()=>{
 const db=store();db.leases=[{id:'l1',unitId:'u1',tenantId:'t-1',status:'archived'}];
 const view=scoped({user:{role:'staff',staffId:'s1'}},db);
 assert.equal(view.clients.some(x=>x.id==='t-1'),false);
});

test('v243 cannot archive a customer currently linked to an active contract',()=>{
 const db=store();db.leases=[{id:'l1',unitId:'u1',tenantId:'t-1',status:'active'}];
 const actor={id:'admin'};
 assert.throws(()=>archiveRecord(db,'clients','t-1',actor),e=>e.status===409);
 assert.equal(db.clients[0].status,'active');
 db.leases[0].status='ended';
 assert.equal(archiveRecord(db,'clients','t-1',actor).archived,true);
});
