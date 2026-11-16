import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {seed} from '../src/seed.js';
import {upgrade} from '../src/store.js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const readSource=`import {getDb} from './backend/src/store.js';const db=await getDb();console.log(JSON.stringify({version:db.version,units:db.units.length,payments:db.payments.length,depositTransactions:db.depositTransactions.length}));`;
const writeSource=`import {updateDb} from './backend/src/store.js';await updateDb(db=>{db.preferences.company='AUREL_TEST_WRITE';});`;
function run(folder,source){const p=spawnSync(process.execPath,['--input-type=module','-e',source],{cwd:root,encoding:'utf8',timeout:15000,env:{...process.env,AUREL_STORAGE:'json',AUREL_DEMO_DATA_DIR:folder}});assert.equal(p.status,0,p.stderr||p.error?.message);return p.stdout.trim()}
function workspace(t){const folder=mkdtempSync(path.join(tmpdir(),'aurel-v258-durable-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));return folder}

test('V2.58 persisted schema v9 is read without rewriting the JSON file',t=>{
 const folder=workspace(t),file=path.join(folder,'local-demo.json');
 const state=upgrade(seed());writeFileSync(file,JSON.stringify(state));
 const before=statSync(file,{bigint:true}),original=readFileSync(file);
 const result=JSON.parse(run(folder,readSource));
 assert.equal(result.version,9);assert.equal(result.units,state.units.length);
 assert.deepEqual(readFileSync(file),original);
 assert.equal(statSync(file,{bigint:true}).mtimeNs,before.mtimeNs,'A read-only operation cannot touch the saved workspace');
 assert.equal(readdirSync(folder).filter(n=>n.endsWith('.tmp')).length,0);
});
test('V2.58 JSON update uses a flushed unique temporary file, then leaves a complete record',t=>{
 const folder=workspace(t),file=path.join(folder,'local-demo.json');
 run(folder,readSource); // first-run isolated demo seed
 run(folder,writeSource);
 const stored=JSON.parse(readFileSync(file,'utf8'));
 assert.equal(stored.version,9);assert.equal(stored.preferences.company,'AUREL_TEST_WRITE');
 assert.equal(readdirSync(folder).filter(n=>n.endsWith('.tmp')).length,0);
 assert.equal(JSON.parse(run(folder,readSource)).version,9);
 if(process.platform!=='win32')assert.equal(statSync(file).mode&0o777,0o600);
});
test('V2.58 legacy migration upgrades once and the subsequent read is read-only',t=>{
 const folder=workspace(t),file=path.join(folder,'local-demo.json');
 const legacy=seed();legacy.depositTransactions=[];
 writeFileSync(file,JSON.stringify(legacy));
 const first=JSON.parse(run(folder,readSource));
 assert.equal(first.version,9);assert.equal(first.depositTransactions,0,'An expected deposit must not create a receipt');
 const migrated=readFileSync(file),before=statSync(file,{bigint:true});
 const second=JSON.parse(run(folder,readSource));
 assert.equal(second.depositTransactions,0);assert.deepEqual(readFileSync(file),migrated);
 assert.equal(statSync(file,{bigint:true}).mtimeNs,before.mtimeNs);
});
