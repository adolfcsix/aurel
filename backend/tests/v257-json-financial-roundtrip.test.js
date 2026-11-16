import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// This is a disposable JSON store workflow, not HTTP, React, PostgreSQL, or real cash.
test('V2.57: independent processes preserve maker/checker/payer ledger without duplicate payout',()=>{
 const folder=mkdtempSync(path.join(tmpdir(),'aurel-v257-safe-ledger-'));
 try{
  const state={version:9,preferences:{company:'TEST',defaultFee:6},
   leases:[{id:'lease-1',unitId:'unit-1',status:'ended'}],
   units:[{id:'unit-1',status:'vacant'}],
   depositTransactions:[{id:'receipt-1',leaseId:'lease-1',unitId:'unit-1',kind:'receive',amount:2500000,reference:'QA-OPENING-1'}],
   depositSettlements:[],audit:[],users:[{id:'test-admin'}]};
  writeFileSync(path.join(folder,'local-demo.json'),JSON.stringify(state));
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const runner=`
    import {getDb,updateDb} from './backend/src/store.js';
    import {submitDepositProposal,approveDepositProposal,executeDepositProposal} from './backend/src/deposit-approvals.js';
    const stage=process.argv[1];
    const actor=(id)=>({id,name:'QA user'});
    try{
      let outcome;
      if(stage==='maker')outcome=await updateDb(db=>submitDepositProposal(db,'lease-1',{refund:2500000,idempotencyKey:'QA-REFUND-57'},actor(7)));
      else if(stage==='self-approval')outcome=await updateDb(db=>approveDepositProposal(db,db.depositSettlements[0].id,actor('7')));
      else if(stage==='approve')outcome=await updateDb(db=>approveDepositProposal(db,db.depositSettlements[0].id,actor(8)));
      else if(stage==='self-execute')outcome=await updateDb(db=>executeDepositProposal(db,db.depositSettlements[0].id,actor('8'),{reference:'BANK-TEST-57'},'2026-11-12'));
      else if(stage==='execute'||stage==='replay')outcome=await updateDb(db=>executeDepositProposal(db,db.depositSettlements[0].id,actor(9),{reference:'BANK-TEST-57'},'2026-11-12'));
      const db=await getDb();
      console.log(JSON.stringify({ok:true,status:db.depositSettlements[0].status,txCount:db.depositTransactions.length,auditCount:db.audit.length,id:outcome.id}));
    }catch(error){const db=await getDb();console.log(JSON.stringify({ok:false,code:error.status||500,status:db.depositSettlements[0]?.status,txCount:db.depositTransactions.length,auditCount:db.audit.length}));}
  `;
  const run=(stage)=>{
   const proc=spawnSync(process.execPath,['--input-type=module','-e',runner,stage],{
    cwd:root,encoding:'utf8',timeout:12000,
    env:{...process.env,AUREL_STORAGE:'json',AUREL_DEMO_DATA_DIR:folder,DEMO_ADMIN_PASSWORD:'unused'}
   });
   assert.equal(proc.status,0,proc.stderr);
   return JSON.parse(proc.stdout.trim());
  };
  assert.deepEqual([run('maker').ok,run('self-approval').code,run('approve').status],[true,403,'approved']);
  const blocked=run('self-execute');assert.equal(blocked.code,403);assert.equal(blocked.txCount,1);
  const first=run('execute'),again=run('replay');
  assert.equal(first.status,'executed');assert.equal(first.txCount,2);
  assert.equal(again.id,first.id);assert.equal(again.txCount,2);assert.equal(again.auditCount,3);
  const stored=JSON.parse(readFileSync(path.join(folder,'local-demo.json'),'utf8'));
  assert.equal(stored.depositSettlements.length,1);
  assert.equal(stored.depositTransactions.filter(t=>t.kind==='settle').length,1);
  assert.equal(stored.depositTransactions.find(t=>t.kind==='receive').amount,2500000);
 }finally{rmSync(folder,{recursive:true,force:true})}
});
