import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

test('isolated JSON demo serializes concurrent writes without lost updates',async()=>{
 const temp=await mkdtemp(path.join(tmpdir(),'aurel-v06-storage-'));
 const prev={dir:process.env.AUREL_DEMO_DATA_DIR,storage:process.env.AUREL_STORAGE};
 try{
  process.env.AUREL_DEMO_DATA_DIR=temp;process.env.AUREL_STORAGE='json';
  const {resetDb,updateDb,getDb}=await import('../src/store.js');
  await resetDb();
  const first=updateDb(async db=>{await delay(70);db.preferences.company='AUREL CONCURRENT QA';db.preferences.first='saved'});
  const second=updateDb(async db=>{db.preferences.second='saved';db.preferences.reminderDays=3});
  await Promise.all([first,second]);
  const state=await getDb(),file=JSON.parse(await readFile(path.join(temp,'local-demo.json'),'utf8'));
  assert.equal(state.preferences.company,'AUREL CONCURRENT QA');
  assert.equal(state.preferences.first,'saved');assert.equal(state.preferences.second,'saved');
  assert.equal(file.preferences.reminderDays,3);assert.equal(file.version,9);
 }finally{
  if(prev.dir===undefined)delete process.env.AUREL_DEMO_DATA_DIR;else process.env.AUREL_DEMO_DATA_DIR=prev.dir;
  if(prev.storage===undefined)delete process.env.AUREL_STORAGE;else process.env.AUREL_STORAGE=prev.storage;
  await rm(temp,{recursive:true,force:true});
 }
});
