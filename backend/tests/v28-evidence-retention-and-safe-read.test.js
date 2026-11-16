import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readVerifiedAttachment,auditStoredAttachments,MAX_ATTACHMENT_BYTES} from '../src/payment-attachments.js';

const data=Buffer.from('%PDF-1.7\n% AUREL retention test\n%%EOF');
const digest=createHash('sha256').update(data).digest('hex');
const storedName='11111111-1111-4111-8111-111111111111.pdf';
const record=(overrides={})=>({id:'archived-test',paymentId:'paid-test',diskName:storedName,status:'archived',mime:'application/pdf',size:data.length,sha256:digest,...overrides});
async function temp(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'aurel-v28-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}

test('V2.8: archived financial evidence is still verified, not silently skipped',async t=>{
 const dir=await temp(t);await fs.writeFile(path.join(dir,storedName),data);
 const db={paymentAttachments:[record()]};
 const valid=await auditStoredAttachments(db,{baseDir:dir});
 assert.deepEqual(valid.summary,{checked:1,valid:1,missing:0,corrupt:0});
 await fs.rm(path.join(dir,storedName));
 const missing=await auditStoredAttachments(db,{baseDir:dir});
 assert.deepEqual(missing.summary,{checked:1,valid:0,missing:1,corrupt:0});
 assert.equal(missing.issues[0].code,'MISSING_EVIDENCE');
});

test('V2.8: archived evidence with modified bytes triggers a failure',async t=>{
 const dir=await temp(t);await fs.writeFile(path.join(dir,storedName),Buffer.from('%PDF-1.7\n% tampered evidence!\n%%EOF'));
 const result=await auditStoredAttachments({paymentAttachments:[record()]},{baseDir:dir});
 assert.equal(result.summary.checked,1);
 assert.equal(result.summary.corrupt,1);
});

test('V2.8: symbolic link under private storage is rejected, even if bytes match',async t=>{
 const dir=await temp(t);const outside=path.join(dir,'real.pdf');await fs.writeFile(outside,data);
 await fs.symlink(outside,path.join(dir,storedName));
 await assert.rejects(readVerifiedAttachment(record(),{baseDir:dir}),e=>e.status===409);
 const result=await auditStoredAttachments({paymentAttachments:[record()]},{baseDir:dir});
 assert.equal(result.summary.corrupt,1);
});

test('V2.8: large and invalid metadata never causes unbounded file allocation',async t=>{
 const dir=await temp(t);await fs.writeFile(path.join(dir,storedName),data);
 for(const size of [MAX_ATTACHMENT_BYTES+1,-1,NaN,2.4]){
  await assert.rejects(readVerifiedAttachment(record({size}),{baseDir:dir}),e=>e.status===409);
 }
});

test('V2.8: missing evidence fails as missing and appended bytes fail as corrupt',async t=>{
 const dir=await temp(t),filepath=path.join(dir,storedName);
 await assert.rejects(readVerifiedAttachment(record(),{baseDir:dir}),e=>e.status===404);
 await fs.writeFile(filepath,Buffer.concat([data,Buffer.from('extra')]));
 await assert.rejects(readVerifiedAttachment(record(),{baseDir:dir}),e=>e.status===409);
});

test('V2.8: valid original proof reads exactly and is not modified by the audit',async t=>{
 const dir=await temp(t),filepath=path.join(dir,storedName);await fs.writeFile(filepath,data);
 assert.deepEqual(await readVerifiedAttachment(record(),{baseDir:dir}),data);
 assert.deepEqual(await fs.readFile(filepath),data);
});

test('V2.8: CLI checks archived file loss without modifying the underlying ledger',async t=>{
 const dir=await temp(t),state=path.join(dir,'local-demo.json');
 const original=JSON.stringify({paymentAttachments:[record()]});await fs.writeFile(state,original);
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
 const result=spawnSync(process.execPath,['scripts/evidence-integrity.mjs'],{
  cwd:root,encoding:'utf8',timeout:15000,
  env:{...process.env,AUREL_STORAGE:'json',AUREL_DEMO_DATA_DIR:dir,AUREL_EVIDENCE_DIR:''}
 });
 assert.equal(result.status,1,result.stderr);
 assert.match(result.stdout,/1 indexed \/ 0 verified \/ 1 missing/);
 assert.equal(await fs.readFile(state,'utf8'),original);
});

test('diagnostic uses the project name without a release label',async()=>{
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
 const source=await fs.readFile(path.join(root,'backend/src/doctor.js'),'utf8');
 assert.match(source,/console\.log\('AUREL diagnostic'\)/);
 assert.doesNotMatch(source,/diagnostic · V/);
 assert.doesNotMatch(source,/diagnostic · V2\.4/);
});
