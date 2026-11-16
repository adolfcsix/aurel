import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {seed} from '../src/seed.js';
import {upgrade} from '../src/store.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
function testWorkspace(t){
 const directory=mkdtempSync(path.join(tmpdir(),'aurel-v259-readonly-'));
 t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const initial=upgrade(seed());
 writeFileSync(path.join(directory,'local-demo.json'),JSON.stringify(initial));
 return {directory,initial,file:path.join(directory,'local-demo.json')};
}
function run(directory,source){
 const child=spawnSync(process.execPath,['--input-type=module','-e',source],{
  cwd:root,encoding:'utf8',timeout:15000,
  env:{...process.env,AUREL_STORAGE:'json',AUREL_DEMO_DATA_DIR:directory}
 });
 assert.equal(child.status,0,child.stderr||child.error?.message);
 return JSON.parse(child.stdout.trim());
}

test('V2.59: modifying a getDb snapshot cannot mutate the JSON cache or persisted records',t=>{
 const {directory,initial,file}=testWorkspace(t),original=readFileSync(file);
 const result=run(directory,`
  import {getDb} from './backend/src/store.js';
  const before=await getDb();
  before.units[0].code='TAMPERED-WITHOUT-TRANSACTION';
  before.preferences.company='TAMPERED-WITHOUT-TRANSACTION';
  before.units.push({id:'INJECTED'});
  const after=await getDb();
  console.log(JSON.stringify({code:after.units[0].code,company:after.preferences.company,count:after.units.length,independent:before.units!==after.units}));
 `);
 assert.equal(result.code,initial.units[0].code);
 assert.equal(result.company,initial.preferences.company);
 assert.equal(result.count,initial.units.length);
 assert.equal(result.independent,true);
 assert.deepEqual(readFileSync(file),original,'A read-only snapshot must not touch the disk');
});

test('V2.59: an entity returned from updateDb does not expose the committed cache',t=>{
 const {directory,file}=testWorkspace(t);
 const result=run(directory,`
  import {getDb,updateDb} from './backend/src/store.js';
  const committed=await updateDb(db=>{db.units[0].code='V259-COMMITTED';return db.units[0]});
  committed.code='POST-COMMIT-MUTATION';
  const after=await getDb();
  console.log(JSON.stringify({actual:after.units[0].code,returned:committed.code}));
 `);
 assert.equal(result.actual,'V259-COMMITTED');
 assert.equal(result.returned,'POST-COMMIT-MUTATION');
 assert.equal(JSON.parse(readFileSync(file,'utf8')).units[0].code,'V259-COMMITTED');
});

test('V2.59: resetDb returns a detached snapshot, not the live JSON cache',t=>{
 const {directory}=testWorkspace(t);
 const result=run(directory,`
  import {getDb,resetDb} from './backend/src/store.js';
  const fresh=await resetDb();
  const oldCode=fresh.units[0].code;
  fresh.units[0].code='TAMPERED-RESET-RETURN';
  fresh.preferences.company='TAMPERED-RESET-RETURN';
  const read=await getDb();
  console.log(JSON.stringify({oldCode,actual:read.units[0].code,company:read.preferences.company}));
 `);
 assert.equal(result.actual,result.oldCode);
 assert.notEqual(result.company,'TAMPERED-RESET-RETURN');
});

test('V2.59: a rejected JSON transaction must preserve cache and file unchanged',t=>{
 const {directory,file}=testWorkspace(t),before=readFileSync(file);
 const result=run(directory,`
  import {getDb,updateDb} from './backend/src/store.js';
  let rejected=false;
  try{await updateDb(db=>{db.units[0].code='SHOULD-ROLLBACK';throw Error('test abort')})}catch{rejected=true}
  const read=await getDb();
  console.log(JSON.stringify({rejected,code:read.units[0].code}));
 `);
 assert.equal(result.rejected,true);
 assert.notEqual(result.code,'SHOULD-ROLLBACK');
 assert.deepEqual(readFileSync(file),before);
});
