import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const admin={id:'test-admin',role:'admin',name:'Admin'};
const script=(code,dir)=>{
 const proc=spawnSync(process.execPath,['--input-type=module','-e',code],{
  cwd:new URL('../src/',import.meta.url).pathname,
  env:{...process.env,AUREL_STORAGE:'json',AUREL_DEMO_DATA_DIR:dir},
  encoding:'utf8',timeout:12000
 });
 assert.equal(proc.status,0,(proc.stderr||'').slice(0,800));
 return proc.stdout.trim();
};
test('V2.68: verified owner association and private note survive a fresh Node process; transfer revokes access',()=>{
 const dir=mkdtempSync(join(tmpdir(),'aurel-owner-v268-'));
 try{
  script(`import {updateDb} from './store.js';
   import {verifyOwnerLink,saveOwnedUnitNote} from './ownership.js';
   const admin=${JSON.stringify(admin)};
   await updateDb(db=>{db.users.push({id:'owner-acct-268',name:'Test Owner',role:'viewer',status:'active'});db.clients.push({id:'owner-client-268',name:'Client',type:'owner',status:'active'});db.units.push({id:'owner-unit-268',code:'TEST-268',ownerId:'owner-client-268',status:'vacant'});});
   await updateDb(db=>verifyOwnerLink(db,'owner-acct-268','owner-client-268',admin));
   await updateDb(db=>saveOwnedUnitNote(db,'owner-acct-268','owner-unit-268','Ghi chú chỉ tài khoản thấy'));
   console.log('written');`,dir);
  const a=script(`import {getDb} from './store.js';import {verifiedOwnedUnits} from './ownership.js';const db=await getDb();console.log(JSON.stringify(verifiedOwnedUnits(db,db.users.find(u=>u.id==='owner-acct-268'))));`,dir);
  assert.match(a,/Ghi chú chỉ tài khoản thấy/);assert.match(a,/TEST-268/);
  script(`import {updateDb} from './store.js';await updateDb(db=>{db.units.find(u=>u.id==='owner-unit-268').ownerId='different-owner';});`,dir);
  const b=script(`import {getDb} from './store.js';import {verifiedOwnedUnits} from './ownership.js';const db=await getDb();console.log(JSON.stringify(verifiedOwnedUnits(db,db.users.find(u=>u.id==='owner-acct-268'))));`,dir);
  assert.equal(b,'[]');
 }finally{rmSync(dir,{recursive:true,force:true})}
});
