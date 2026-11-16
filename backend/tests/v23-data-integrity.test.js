import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {seed} from '../src/seed.js';
import {upgrade} from '../src/store.js';
import {scanDataQuality} from '../src/data-quality.js';

const actor={id:'staff-qa',name:'QA'};
const fresh=()=>structuredClone(upgrade(seed()));
const codes=db=>new Set(scanDataQuality(db,{limit:1000}).issues.map(x=>x.code));

test('V2.3 baseline data has no invented quality faults',()=>{
 const result=scanDataQuality(fresh());
 assert.equal(result.summary.critical,0);
 assert.equal(result.summary.warning,0);
});
test('V2.3 flags duplicated deposit-receipt idempotency keys',()=>{
 const db=fresh();const original=db.depositTransactions[0];
 db.depositTransactions.push({...original,id:'duplicate-id',idempotencyKey:'dup-a'});
 db.depositTransactions.push({...original,id:'duplicate-id2',idempotencyKey:'dup-a'});
 assert.ok(codes(db).has('REUSED_DEPOSIT_KEY'));
});
test('V2.3 flags two settlement transactions with one reference',()=>{
 const db=fresh();const lease=db.leases[0];
 for(const id of ['a','b'])db.depositTransactions.push({id:`set-${id}`,kind:'settle',leaseId:lease.id,unitId:lease.unitId,amount:3000,refund:3000,deduction:0,reference:'SAME-REFERENCE',proposalId:`proposal-${id}`});
 assert.ok(codes(db).has('DUPLICATE_SETTLEMENT_REFERENCE'));
});
test('V2.3 flags executed proposal without or with mismatched settlement',()=>{
 const db=fresh(),lease=db.leases[0];
 db.depositSettlements.push({id:'test-proposal',leaseId:lease.id,unitId:lease.unitId,refund:1000,deduction:0,status:'executed',transactionId:'missing'});
 assert.ok(codes(db).has('SETTLEMENT_TRANSACTION_COUNT'));
 db.depositTransactions.push({id:'receipt',proposalId:'test-proposal',leaseId:lease.id,unitId:lease.unitId,kind:'settle',amount:2000,refund:2000,deduction:0,reference:'UNIQUE-REF'});
 const found=codes(db);
 assert.ok(!found.has('SETTLEMENT_TRANSACTION_COUNT'));
 assert.ok(found.has('SETTLEMENT_AMOUNT_MISMATCH'));
});
test('V2.3 flags orphaned payment evidence',()=>{
 const db=fresh();db.paymentAttachments.push({id:'orphan-proof',paymentId:'missing'});
 assert.ok(codes(db).has('ORPHAN_PAYMENT_ATTACHMENT'));
});
test('V2.3 does not flag valid executed proposal and valid payment evidence',()=>{
 const db=fresh(),lease=db.leases[0],p=db.payments[0];
 db.depositSettlements.push({id:'prop-good',leaseId:lease.id,unitId:lease.unitId,refund:1200,deduction:0,status:'executed',transactionId:'settle-good'});
 db.depositTransactions.push({id:'settle-good',proposalId:'prop-good',leaseId:lease.id,unitId:lease.unitId,kind:'settle',amount:1200,refund:1200,deduction:0,reference:'REF-GOOD'});
 db.paymentAttachments.push({id:'att-good',paymentId:p.id});
 const issues=codes(db);
 assert.ok(!issues.has('SETTLEMENT_AMOUNT_MISMATCH'));
 assert.ok(!issues.has('ORPHAN_PAYMENT_ATTACHMENT'));
});
test('V2.3 CLI reads an explicit JSON demo file without changing its bytes',()=>{
 const tmp=mkdtempSync(path.join(tmpdir(),'aurel-readonly-qa-'));
 try{
  const dataFile=path.join(tmp,'local-demo.json'),db=fresh();
  writeFileSync(dataFile,JSON.stringify(db));
  const before=readFileSync(dataFile);
  const runner=fileURLToPath(new URL('../../scripts/data-integrity.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[runner],{env:{...process.env,AUREL_STORAGE:'json',AUREL_DEMO_DATA_DIR:tmp},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/PASS/);
  assert.deepEqual(readFileSync(dataFile),before);
 }finally{rmSync(tmp,{recursive:true,force:true});}
});
test('V2.3 CLI blocks use of implicit or missing JSON path',()=>{
 const runner=fileURLToPath(new URL('../../scripts/data-integrity.mjs',import.meta.url));
 const result=spawnSync(process.execPath,[runner],{env:{...process.env,AUREL_STORAGE:'json',AUREL_DEMO_DATA_DIR:''},encoding:'utf8'});
 assert.equal(result.status,2);
 assert.match(result.stderr,/BLOCKED/);
});
test('V2.3 CLI returns a failing status for corrupted financial data without touching the source file',()=>{
 const tmp=mkdtempSync(path.join(tmpdir(),'aurel-integrity-negative-'));
 try{
  const f=path.join(tmp,'local-demo.json'),db=fresh();
  db.paymentAttachments.push({id:'dangling-proof',paymentId:'unknown-payment'});
  writeFileSync(f,JSON.stringify(db));
  const before=readFileSync(f);
  const runner=fileURLToPath(new URL('../../scripts/data-integrity.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[runner],{env:{...process.env,AUREL_STORAGE:'json',AUREL_DEMO_DATA_DIR:tmp},encoding:'utf8'});
  assert.equal(result.status,1,result.stderr);
  assert.match(result.stdout,/ORPHAN_PAYMENT_ATTACHMENT/);
  assert.deepEqual(readFileSync(f),before);
 }finally{rmSync(tmp,{recursive:true,force:true});}
});
