import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {evidenceDirectory,attachmentDir,addPaymentAttachment,readVerifiedAttachment,removeOrphanAttachment,auditStoredAttachments,auditUnindexedAttachments,resolveAttachment} from '../src/payment-attachments.js';
import {seed} from '../src/seed.js';
import {upgrade} from '../src/store.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const pdf=Buffer.from('%PDF-1.7\n% AUREL isolated QA sample\n%%EOF');
const maker={id:'test-user',name:'QA'};
const withTmp=async(t)=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'aurel-v27-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;};

test('V2.7: JSON test environment keeps receipts alongside disposable state',async t=>{
 const dir=await withTmp(t);
 const evidence=evidenceDirectory({AUREL_STORAGE:'json',AUREL_DEMO_DATA_DIR:dir});
 assert.equal(evidence,path.join(dir,'payment-attachments'));
 assert.notEqual(evidence,attachmentDir);
 assert.equal(evidenceDirectory({AUREL_DEMO_DATA_DIR:dir}),evidence);
 assert.equal(evidenceDirectory({AUREL_STORAGE:'postgres',AUREL_DEMO_DATA_DIR:dir}),attachmentDir);
});

test('V2.7: custom evidence storage takes precedence without mixing demo and PostgreSQL paths',async t=>{
 const dir=await withTmp(t);
 const preferred=path.join(dir,'secured-evidence');
 for(const mode of ['json','postgres']){
  assert.equal(evidenceDirectory({AUREL_STORAGE:mode,AUREL_DEMO_DATA_DIR:dir,AUREL_EVIDENCE_DIR:preferred}),preferred);
 }
 assert.equal(evidenceDirectory({AUREL_EVIDENCE_DIR:'  '}),attachmentDir);
});

test('V2.7: a receipt can be written, verified, audited and removed within an isolated JSON workspace',async t=>{
 const dir=await withTmp(t);const before={...process.env};
 t.after(()=>{for(const key of ['AUREL_STORAGE','AUREL_DEMO_DATA_DIR','AUREL_EVIDENCE_DIR']){
  if(Object.hasOwn(before,key))process.env[key]=before[key];else delete process.env[key];
 }});
 process.env.AUREL_STORAGE='json';process.env.AUREL_DEMO_DATA_DIR=dir;delete process.env.AUREL_EVIDENCE_DIR;
 const db=upgrade(seed()),payment=db.payments[0];payment.status='posted';
 const record=await addPaymentAttachment(db,pdf,'application/pdf','receipts-for-QA.pdf',payment.id,maker);
 const storePath=resolveAttachment(record);
 assert.equal(path.dirname(storePath),path.join(dir,'payment-attachments'));
 assert.deepEqual(await readVerifiedAttachment(record),pdf);
 const audit=await auditStoredAttachments(db);
 assert.deepEqual(audit.summary,{checked:1,valid:1,missing:0,corrupt:0});
 assert.equal(db.paymentAttachments[0].sha256,record.sha256);
 await removeOrphanAttachment(record.diskName);
 await assert.rejects(fs.stat(storePath),{code:'ENOENT'});
 const missing=await auditStoredAttachments(db);
 assert.equal(missing.summary.missing,1);
});

test('V2.7: read-only evidence QA script verifies files under AUREL_DEMO_DATA_DIR, without modifying the ledger',async t=>{
 const dir=await withTmp(t),folder=path.join(dir,'payment-attachments');await fs.mkdir(folder);
 const digest=(await import('node:crypto')).createHash('sha256').update(pdf).digest('hex');
 const row={id:'e1',paymentId:'p1',status:'active',diskName:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf',mime:'application/pdf',filename:'qa.pdf',size:pdf.length,sha256:digest};
 const jsonPath=path.join(dir,'local-demo.json');
 const original=JSON.stringify({paymentAttachments:[row]});await fs.writeFile(jsonPath,original);
 await fs.writeFile(path.join(folder,row.diskName),pdf);
 const args=['scripts/evidence-integrity.mjs'];
 const run=()=>spawnSync(process.execPath,args,{cwd:root,env:{...process.env,AUREL_STORAGE:'json',AUREL_DEMO_DATA_DIR:dir,AUREL_EVIDENCE_DIR:''},encoding:'utf8',timeout:10000});
 const valid=run();assert.equal(valid.status,0,valid.stderr);assert.match(valid.stdout,/1 indexed \/ 1 verified/);
 assert.equal(await fs.readFile(jsonPath,'utf8'),original,'QA must not alter source data');
 await fs.writeFile(path.join(folder,row.diskName),Buffer.from('%PDF-1.7\n% tampered unrelated file data'));
 const invalid=run();assert.equal(invalid.status,1,invalid.stderr);assert.match(invalid.stdout,/1 invalid/);
 assert.equal(await fs.readFile(jsonPath,'utf8'),original,'failed QA must also be read-only');
});

test('V2.7: unindexed evidence files are flagged without revealing their paths or deleting them',async t=>{
 const dir=await withTmp(t);
 const known='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf';
 const orphan='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf';
 await fs.writeFile(path.join(dir,known),pdf);
 await fs.writeFile(path.join(dir,orphan),pdf);
 await fs.writeFile(path.join(dir,'unrelated.txt'),'do not scan');
 const db={paymentAttachments:[{diskName:known,status:'archived'}]};
 const before=await fs.readdir(dir);
 const result=await auditUnindexedAttachments(db,{baseDir:dir});
 assert.deepEqual(result,{scanned:2,unindexed:1});
 assert.equal(JSON.stringify(result).includes(orphan),false);
 assert.deepEqual(await fs.readdir(dir),before,'read-only QA must leave files untouched');
});

test('V2.7: evidence audit does not treat a missing empty directory as a failed receipt',async t=>{
 const dir=await withTmp(t),notYetCreated=path.join(dir,'payment-attachments');
 assert.deepEqual(await auditUnindexedAttachments({paymentAttachments:[]},{baseDir:notYetCreated}),{scanned:0,unindexed:0});
});

test('V2.7: CLI detects an unindexed orphan without changing the ledger or physical evidence',async t=>{
 const dir=await withTmp(t),folder=path.join(dir,'payment-attachments');await fs.mkdir(folder);
 const jsonPath=path.join(dir,'local-demo.json');const original=JSON.stringify({paymentAttachments:[]});
 await fs.writeFile(jsonPath,original);
 const orphanPath=path.join(folder,'cccccccc-cccc-4ccc-8ccc-cccccccccccc.pdf');await fs.writeFile(orphanPath,pdf);
 const result=spawnSync(process.execPath,['scripts/evidence-integrity.mjs'],{
  cwd:root,encoding:'utf8',timeout:10000,env:{...process.env,AUREL_STORAGE:'json',AUREL_DEMO_DATA_DIR:dir,AUREL_EVIDENCE_DIR:''}});
 assert.equal(result.status,1,result.stderr);
 assert.match(result.stdout,/1 unindexed on disk/);
 assert.equal(await fs.readFile(jsonPath,'utf8'),original);
 assert.deepEqual(await fs.readFile(orphanPath),pdf);
});

test('V2.7: receipts from two disposable workspaces never share a private file path',async t=>{
 const first=await withTmp(t),second=await withTmp(t);const envBefore={...process.env};
 t.after(()=>{for(const key of ['AUREL_STORAGE','AUREL_DEMO_DATA_DIR','AUREL_EVIDENCE_DIR']){
  if(Object.hasOwn(envBefore,key))process.env[key]=envBefore[key];else delete process.env[key];
 }});
 process.env.AUREL_STORAGE='json';delete process.env.AUREL_EVIDENCE_DIR;
 const paths=[];
 for(const dir of [first,second]){
  process.env.AUREL_DEMO_DATA_DIR=dir;
  const db=upgrade(seed()),payment=db.payments[0];payment.status='posted';
  const record=await addPaymentAttachment(db,pdf,'application/pdf','qa.pdf',payment.id,maker);
  paths.push(resolveAttachment(record));
  assert.deepEqual(await readVerifiedAttachment(record),pdf);
 }
 assert.notEqual(path.dirname(paths[0]),path.dirname(paths[1]));
 assert.ok(paths[0].startsWith(first+path.sep));
 assert.ok(paths[1].startsWith(second+path.sep));
 assert.equal((await fs.readdir(path.join(first,'payment-attachments'))).length,1);
 assert.equal((await fs.readdir(path.join(second,'payment-attachments'))).length,1);
});

test('V2.7: explicit private evidence directory controls both write and verification',async t=>{
 const rootDir=await withTmp(t),privateDir=path.join(rootDir,'private'),demoDir=path.join(rootDir,'json');
 const before={...process.env};
 t.after(()=>{for(const key of ['AUREL_STORAGE','AUREL_DEMO_DATA_DIR','AUREL_EVIDENCE_DIR']){
  if(Object.hasOwn(before,key))process.env[key]=before[key];else delete process.env[key];
 }});
 process.env.AUREL_STORAGE='json';process.env.AUREL_DEMO_DATA_DIR=demoDir;process.env.AUREL_EVIDENCE_DIR=privateDir;
 const db=upgrade(seed()),payment=db.payments[0];payment.status='posted';
 const receipt=await addPaymentAttachment(db,pdf,'application/pdf','private-qa.pdf',payment.id,maker);
 assert.equal(path.dirname(resolveAttachment(receipt)),privateDir);
 assert.deepEqual((await auditStoredAttachments(db)).summary,{checked:1,valid:1,missing:0,corrupt:0});
 await assert.rejects(fs.stat(path.join(demoDir,'payment-attachments')),{code:'ENOENT'});
});
