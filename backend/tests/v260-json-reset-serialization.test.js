import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

function demoProcess(t,program){
 const dir=mkdtempSync(path.join(tmpdir(),'aurel-v260-demo-'));
 t.after(()=>rmSync(dir,{force:true,recursive:true}));
 const proc=spawnSync(process.execPath,['--input-type=module','-e',program],{
  cwd:path.resolve(import.meta.dirname,'../..'),
  encoding:'utf8',timeout:15000,
  env:{...process.env,AUREL_STORAGE:'json',AUREL_DEMO_DATA_DIR:dir}
 });
 assert.equal(proc.status,0,proc.stderr||proc.error?.message);
 return {dir,result:JSON.parse(proc.stdout.trim())};
}

test('V2.60: a demo reset queued after an in-progress write cannot be overwritten by that write',t=>{
 const {dir,result}=demoProcess(t,`
  import {getDb,updateDb,resetDb} from './backend/src/store.js';
  const initial=await getDb();
  const expected=initial.preferences.company;
  const update=updateDb(async state=>{await new Promise(resolve=>setTimeout(resolve,80));state.preferences.company='LATE-WRITE';return true});
  const reset=resetDb();
  const [updated,fresh]=await Promise.all([update,reset]);
  const after=await getDb();
  console.log(JSON.stringify({updated,expected,resetName:fresh.preferences.company,after:after.preferences.company}));
 `);
 assert.equal(result.updated,true);
 assert.equal(result.resetName,result.expected);
 assert.equal(result.after,result.expected);
 assert.equal(JSON.parse(readFileSync(path.join(dir,'local-demo.json'),'utf8')).preferences.company,result.expected);
});

test('V2.60: a failed pending write does not block a queued demo reset',t=>{
 const {dir,result}=demoProcess(t,`
  import {getDb,updateDb,resetDb} from './backend/src/store.js';
  await getDb();
  const failing=updateDb(async state=>{state.preferences.company='FAILED-WRITE';await new Promise(resolve=>setTimeout(resolve,40));throw Error('abort')});
  const reset=resetDb();
  const failures=await Promise.allSettled([failing,reset]);
  const after=await getDb();
  console.log(JSON.stringify({status:failures.map(x=>x.status),after:after.preferences.company}));
 `);
 assert.deepEqual(result.status,['rejected','fulfilled']);
 assert.notEqual(result.after,'FAILED-WRITE');
 assert.equal(JSON.parse(readFileSync(path.join(dir,'local-demo.json'),'utf8')).preferences.company,result.after);
});
