/**
 * Dependency-free, disposable JSON backup/restore DRILL.
 * Never reads/writes configured AUREL_DEMO_DATA_DIR or a production DB.
 * This is NOT proof that PostgreSQL backups can be restored.
 */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'aurel-v274-recovery-'));
const dataDir=path.join(folder,'isolated-data');
const dataFile=path.join(dataDir,'local-demo.json');
const backup=path.join(folder,'snapshot.json');
const digest=b=>createHash('sha256').update(b).digest('hex');
const qenv={...process.env,AUREL_STORAGE:'json',AUREL_DEMO_DATA_DIR:dataDir,DATABASE_URL:'',ADMIN_INITIAL_PASSWORD:''};
const storeUrl=new URL('../backend/src/store.js',import.meta.url).href;
function processStore(mode){
 const script=`import {getDb,updateDb} from ${JSON.stringify(storeUrl)};
 if(${JSON.stringify(mode)}==='init'){
  await getDb();await updateDb(db=>{db.preferences.company='AUREL isolated recovery';db.payments.push({id:'qa-receipt-274',unitId:'qa-unit',amount:125000,status:'posted',createdAt:'2026-11-12T00:00:00.000Z'});db.depositTransactions.push({id:'qa-deposit-274',unitId:'qa-unit',amount:200000,status:'received'});});
 }else if(${JSON.stringify(mode)}==='mutate'){
  await updateDb(db=>{db.preferences.company='MUTATED QA';db.payments=[];db.depositTransactions=[];});
 }
 const db=await getDb();if(!Array.isArray(db.units)||!Array.isArray(db.payments))throw Error('Invalid reopened state');
 console.log(JSON.stringify({company:db.preferences.company,payments:db.payments.length,deposits:db.depositTransactions.length}));`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:root,env:qenv,encoding:'utf8',timeout:20000});
 assert.equal(result.status,0,`Isolated ${mode} subprocess failed: ${result.stderr||result.error?.message}`);
 return JSON.parse(result.stdout.trim().split('\n').at(-1));
}
function writePrivate(file,bytes){
 const fd=fs.openSync(file,'wx',0o600);
 try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
}
function verifiedRestore(source,expectedSha,destination){
 const bytes=fs.readFileSync(source);
 if(digest(bytes)!==expectedSha)throw Error('Snapshot SHA-256 mismatch; restore refused');
 let data;
 try{data=JSON.parse(bytes.toString('utf8'))}catch{throw Error('Snapshot is not valid JSON')}
 if(!Number.isInteger(data.version)||data.version<9||!Array.isArray(data.units)||!Array.isArray(data.users)||!Array.isArray(data.payments)||!Array.isArray(data.depositTransactions))throw Error('Snapshot schema invalid');
 // Restore only into the QA random temporary directory. Never accept a caller path.
 assert.equal(path.resolve(destination),path.resolve(dataFile));
 const temporary=path.join(dataDir,`.restore-${randomUUID()}.tmp`);
 try{writePrivate(temporary,bytes);fs.renameSync(temporary,destination)}catch(error){try{fs.rmSync(temporary,{force:true})}catch{}throw error}
}
try{
 assert.notEqual(path.resolve(dataDir),path.resolve(process.env.AUREL_DEMO_DATA_DIR||''),'Must never use the caller demo directory');
 const before=processStore('init');
 assert.equal(before.company,'AUREL isolated recovery');
 assert.ok(before.payments>0&&before.deposits>0);
 const snapshot=fs.readFileSync(dataFile);
 const originalSha=digest(snapshot);
 writePrivate(backup,snapshot);
 const altered=processStore('mutate');
 assert.equal(altered.company,'MUTATED QA');
 assert.notEqual(digest(fs.readFileSync(dataFile)),originalSha);
 // Corruption must not touch even a mutated target.
 const tampered=path.join(folder,'tampered.json');
 writePrivate(tampered,Buffer.concat([snapshot,Buffer.from('tampered')]));
 const mutatedSha=digest(fs.readFileSync(dataFile));
 assert.throws(()=>verifiedRestore(tampered,originalSha,dataFile),/SHA-256 mismatch/);
 assert.equal(digest(fs.readFileSync(dataFile)),mutatedSha,'Rejected recovery changed data');
 // Atomic verified copy, then read in an entirely new Node process.
 verifiedRestore(backup,originalSha,dataFile);
 assert.equal(digest(fs.readFileSync(dataFile)),originalSha,'Restored byte-for-byte snapshot differs');
 const after=processStore('verify');
 assert.deepEqual(after,before,'Restart after restore lost financial or configuration records');
 console.log('PASS isolated JSON disaster-recovery drill: SHA-256 verification, corrupted backup rejected, atomic restore, independent-process financial roundtrip. PostgreSQL recovery NOT RUN.');
}finally{fs.rmSync(folder,{force:true,recursive:true,maxRetries:3,retryDelay:50})}
