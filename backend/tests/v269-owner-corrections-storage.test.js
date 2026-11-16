import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const invoke=(code,dir)=>{
 const output=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:new URL('../src/',import.meta.url).pathname,env:{...process.env,AUREL_STORAGE:'json',AUREL_DEMO_DATA_DIR:dir},encoding:'utf8',timeout:16000});
 assert.equal(output.status,0,output.stderr?.slice(0,1000));return output.stdout.trim();
};
test('V2.69: owner proposal survives JSON reload; manager approval persists unit revision in fresh process',()=>{
 const dir=mkdtempSync(join(tmpdir(),'aurel-v269-'));
 try{
  const init=invoke(`import {updateDb} from './store.js';import {verifyOwnerLink,submitOwnerChange} from './ownership.js';
  await updateDb(db=>{db.users.push({id:'owner-269',name:'Owner',role:'viewer',status:'active'});db.clients.push({id:'client-269',type:'owner',name:'C',status:'active'});db.units.push({id:'unit-269',code:'U269',status:'vacant',ownerId:'client-269',address:'Old',area:50,bedrooms:1,feeBasis:'due',interiorStatus:'partial',revision:0});});
  await updateDb(db=>verifyOwnerLink(db,'owner-269','client-269',{id:'admin',name:'Admin',role:'admin'}));
  const row=await updateDb(db=>submitOwnerChange(db,'owner-269','unit-269',{field:'area',value:55,reason:'Đo lại'}));console.log(row.id);`,dir);
  const result=invoke(`import {getDb,updateDb} from './store.js';import {ownerChangeInbox,decideOwnerChange} from './ownership.js';
  const before=await getDb();if(before.units.find(x=>x.id==='unit-269').area!==50)throw Error('premature change');
  const pending=ownerChangeInbox(before,{id:'manager',role:'manager'});if(pending.length!==1)throw Error('missing request');
  await updateDb(db=>decideOwnerChange(db,pending[0].id,{id:'manager',role:'manager',name:'Manager'},'approve'));console.log(pending[0].id);`,dir);
  assert.equal(result,init);
  const verify=invoke(`import {getDb} from './store.js';import {ownerChangeInbox} from './ownership.js';const db=await getDb();const unit=db.units.find(u=>u.id==='unit-269');if(unit.area!==55||unit.revision!==1)throw Error('approval not persisted');if(ownerChangeInbox(db,{id:'manager',role:'manager'}).length!==0)throw Error('duplicate pending');console.log('OK');`,dir);
  assert.equal(verify,'OK');
 }finally{rmSync(dir,{recursive:true,force:true})}
});
