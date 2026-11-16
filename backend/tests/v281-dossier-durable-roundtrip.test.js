import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const execute=(script,dir)=>spawnSync(process.execPath,['--input-type=module','-e',script],{
 cwd:root,encoding:'utf8',timeout:18000,env:{...process.env,AUREL_STORAGE:'json',AUREL_DEMO_DATA_DIR:dir,DATABASE_URL:'',ADMIN_INITIAL_PASSWORD:''}
});

test('V2.81: client and lease create/edit/reopen persist revisions and preserve payments across a new process',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'aurel-v281-dossiers-'));
 try{
  const writer=execute(`
   import {updateDb,getDb} from './backend/src/store.js';
   import {create} from './backend/src/domain.js';
   import {cleanClient} from './backend/src/client-validation.js';
   import {leasePayload} from './backend/src/lease-identity.js';
   import {assertRecordRevision,bumpRecordRevision} from './backend/src/record-revisions.js';
   import {mirrorLease} from './backend/src/lease-mirror.js';
   await updateDb(db=>{
    db.clients.push(create({...cleanClient({name:'Chủ nhà thử nghiệm',type:'owner'},db),id:'owner281',revision:1}));
    db.clients.push(create({...cleanClient({name:'Khách cũ',type:'tenant'},db),id:'tenant281',revision:1}));
    db.units.push(create({id:'unit281',code:'QA-281',status:'vacant',feeBasis:'due',revision:1}));
   });
   await updateDb(db=>{
    const c=db.clients.find(c=>c.id==='tenant281');
    assertRecordRevision(c,1,'Hồ sơ khách hàng');
    Object.assign(c,cleanClient({...c,name:'Khách mới',phone:'0123456789'},db,c));
    bumpRecordRevision(c);
    const lease=leasePayload({unitId:'unit281',tenantId:'tenant281',tenantName:'Khách mới',startsOn:'2026-12-01',endsOn:'2027-02-28',rent:15000000,depositExpected:20000000,paymentDay:10,status:'active'},db,{id:'lease281',status:'draft'});
    bumpRecordRevision(lease);db.leases.push(lease);mirrorLease(db,lease);
    db.schedules.push(create({id:'period281',unitId:'unit281',leaseId:'lease281',period:'2026-12',dueOn:'2026-12-10',amount:15000000,status:'open'}));
    db.payments.push(create({id:'payment281',unitId:'unit281',leaseId:'lease281',scheduleId:'period281',amount:5000000,status:'posted'}));
   });
   await updateDb(db=>{
    const l=db.leases.find(l=>l.id==='lease281');assertRecordRevision(l,1,'Hợp đồng');
    l.notes='Giao nhận theo phụ lục';bumpRecordRevision(l);
   });
   const snapshot=await getDb();
   if(snapshot.clients.find(c=>c.id==='tenant281').revision!==2)throw Error('client revision');
   if(snapshot.leases.find(l=>l.id==='lease281').revision!==2)throw Error('lease revision');
   if(snapshot.units.find(u=>u.id==='unit281').revision!==2)throw Error('unit mirror revision');
   process.stdout.write('OK');
  `,dir);
  assert.equal(writer.status,0,writer.stderr);
  assert.equal(writer.stdout,'OK');
  const reader=execute(`
   import {getDb,updateDb} from './backend/src/store.js';
   import {assertRecordRevision} from './backend/src/record-revisions.js';
   const db=await getDb();
   const client=db.clients.find(c=>c.id==='tenant281'),lease=db.leases.find(l=>l.id==='lease281'),unit=db.units.find(u=>u.id==='unit281');
   if(client.name!=='Khách mới'||client.phone!=='0123456789'||client.revision!==2)throw Error('client reload');
   if(lease.tenantId!=='tenant281'||lease.notes!=='Giao nhận theo phụ lục'||lease.revision!==2)throw Error('lease reload');
   if(unit.status!=='occupied'||unit.revision!==2||unit.rent!==15000000)throw Error('unit reload');
   if(db.payments.find(p=>p.id==='payment281')?.amount!==5000000)throw Error('financial ledger lost');
   try{await updateDb(next=>{const item=next.leases.find(l=>l.id==='lease281');assertRecordRevision(item,1,'Hợp đồng');item.notes='Bad stale edit';});throw Error('stale write accepted')}
   catch(e){if(e.status!==409)throw e}
   if((await getDb()).leases.find(l=>l.id==='lease281').notes!=='Giao nhận theo phụ lục')throw Error('stale edit persisted');
   process.stdout.write('OK');
  `,dir);
  assert.equal(reader.status,0,reader.stderr);
  assert.equal(reader.stdout,'OK');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
