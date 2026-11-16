/** Dependency-free financial acceptance against the real JSON demo store.
 * Does not exercise Express or PostgreSQL; test data is always disposable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {depositBalance} from '../src/domain.js';
import {receiveDeposit} from '../src/deposit-receipts.js';
import {submitDepositProposal,approveDepositProposal,executeDepositProposal} from '../src/deposit-approvals.js';

const tmp=mkdtempSync(path.join(tmpdir(),'aurel-v22-money-'));
process.env.AUREL_STORAGE='json';
process.env.AUREL_DEMO_DATA_DIR=tmp;
const {getDb,updateDb,resetDb}=await import('../src/store.js');
const maker={id:'v22-admin',name:'Người lập'};
const checker={id:'v22-manager',name:'Người duyệt'};
const payer={id:'v22-accountant',name:'Người chi'};
const day='2026-11-11';

test('V2.2: simultaneous deposit receipts with identical keys commit exactly once',async()=>{
 await resetDb();
 const lease=(await getDb()).leases.find(l=>l.unitId==='u1');
 assert.equal(lease.status,'active');
 const before=depositBalance(await getDb(),lease.id);
 const input={amount:500000,idempotencyKey:'v22-json-concurrent-1',note:'Nhận cọc bổ sung'};
 const results=await Promise.all(Array.from({length:6},()=>updateDb(db=>receiveDeposit(db,lease.id,input,maker,day))));
 assert.equal(new Set(results.map(x=>x.id)).size,1);
 assert.equal(depositBalance(await getDb(),lease.id),before+500000);
 assert.equal((await getDb()).depositTransactions.filter(t=>t.idempotencyKey===input.idempotencyKey).length,1);
});

test('V2.2: failed or unauthorized settlement leaves JSON disk unchanged',async()=>{
 const lease=(await getDb()).leases.find(l=>l.unitId==='u1');
 await updateDb(db=>{db.leases.find(l=>l.id===lease.id).status='ended'});
 const proposal=await updateDb(db=>submitDepositProposal(db,lease.id,{idempotencyKey:'v22-json-refund-auto'},maker));
 await updateDb(db=>approveDepositProposal(db,proposal.id,checker));
 const disk=path.join(tmp,'local-demo.json');
 const before=readFileSync(disk,'utf8');
 await assert.rejects(()=>updateDb(db=>executeDepositProposal(db,proposal.id,checker,{reference:'V22-INVALID'},day)),e=>e.status===403);
 assert.equal(readFileSync(disk,'utf8'),before,'failed transaction must not affect persisted data');
 const settled=await updateDb(db=>executeDepositProposal(db,proposal.id,payer,{reference:'V22-TRANSFER-0001'},day));
 assert.equal(settled.refund,proposal.refund);
 assert.equal(depositBalance(await getDb(),lease.id),0);
 const retry=await updateDb(db=>executeDepositProposal(db,proposal.id,payer,{reference:'V22-TRANSFER-0001'},day));
 assert.equal(retry.id,settled.id);
 assert.equal((await getDb()).depositTransactions.filter(x=>x.proposalId===proposal.id).length,1);
});
process.on('exit',()=>{try{rmSync(tmp,{force:true,recursive:true})}catch{}});
