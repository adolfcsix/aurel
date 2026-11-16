import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {seed} from '../src/seed.js';
import {upgrade} from '../src/store.js';
import {depositBalance} from '../src/domain.js';
import {scanDataQuality} from '../src/data-quality.js';
import {receiveDeposit} from '../src/deposit-receipts.js';
import {submitDepositProposal} from '../src/deposit-approvals.js';

const actor={id:'qa-manager',name:'Người quản lý'};
const lease={id:'7',unitId:'8',status:'ended'};
const emptyFinance=()=>({leases:[{...lease}],depositTransactions:[],depositSettlements:[],audit:[]});

test('V2.56: legacy dossier deposit is a reference amount, never an automatic receipt',()=>{
 const state={version:8,projects:[],buildings:[],units:[{id:'8',code:'TEST',status:'occupied',
  leaseStart:'2026-01-01',leaseEnd:'2026-12-31',rent:10000000,deposit:20000000}],
  leases:[],depositTransactions:[],payments:[],feeHistory:[],preferences:{defaultFee:6}};
 const next=upgrade(state);
 assert.equal(next.version,9);
 assert.equal(next.leases.length,1,'legacy lease dates may be upgraded to a contract record');
 assert.equal(next.depositTransactions.length,0,'a reference amount is NOT a received payment');
 assert.equal(depositBalance(next,next.leases[0].id),0);
});

test('V2.56: already-v9 data is authoritative; reloading never regenerates old leases or schedules',()=>{
 const source={version:9,projects:[],buildings:[],units:[{id:'8',deposit:20000000,
  leaseStart:'2026-01-01',leaseEnd:'2026-12-31',rent:10000000}],
  leases:[],schedules:[],depositTransactions:[],payments:[],clients:[],feeHistory:[],users:[{id:'admin'}]};
 const next=upgrade(source);
 assert.equal(next.leases.length,0);
 assert.equal(next.schedules.length,0);
 assert.equal(next.depositTransactions.length,0);
 assert.equal(next.units[0].deposit,20000000);
 assert.equal(upgrade(next).depositTransactions.length,0);
});

test('V2.56: demo cash ledger is explicit in the seed fixture, not invented by upgrade',()=>{
 const initial=seed(),source=initial.depositTransactions.find(tx=>tx.unitId==='u1');
 assert.ok(source);
 assert.equal(source.amount,21400000);
 assert.equal(source.demoOnly,true);
 assert.match(source.note,/DỮ LIỆU MẪU/);
 const db=upgrade(initial);
 const lease=db.leases.find(l=>l.unitId==='u1');
 assert.equal(depositBalance(db,lease.id),21400000);
 assert.equal(db.depositTransactions.filter(tx=>tx.unitId==='u1').length,1);
 upgrade(db);
 assert.equal(db.depositTransactions.filter(tx=>tx.unitId==='u1').length,1);
});

test('V2.56: historic real deposit receipts survive migration unchanged',()=>{
 const receipt={id:'bank-1',leaseId:'7',unitId:'8',kind:'receive',amount:1234567,reference:'BANK-REAL-001'};
 const db={version:8,units:[],leases:[{...lease}],depositTransactions:[structuredClone(receipt)],
  payments:[],feeHistory:[],schedules:[],projects:[],buildings:[]};
 upgrade(db);
 assert.deepEqual(db.depositTransactions,[receipt]);
 assert.equal(depositBalance(db,'7'),1234567);
});

test('V2.56: persisted JSON-v9 reopened in a new Node process does not mint deposit transactions',()=>{
 const folder=mkdtempSync(path.join(tmpdir(),'aurel-v256-finance-'));
 try{
  const db={version:9,preferences:{company:'TEST',defaultFee:6},users:[{id:'admin'}],
   projects:[],buildings:[],units:[{id:'u1',status:'vacant',deposit:15000000,
    leaseStart:'2026-01-01',leaseEnd:'2026-12-31'}],leases:[],schedules:[],depositTransactions:[],audit:[]};
  writeFileSync(path.join(folder,'local-demo.json'),JSON.stringify(db));
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const code="import {getDb} from './backend/src/store.js'; const db=await getDb(); console.log(JSON.stringify({leases:db.leases.length,schedules:db.schedules.length,deposit:db.depositTransactions.length}));";
  const child=spawnSync(process.execPath,['--input-type=module','-e',code],{
   cwd:root,encoding:'utf8',timeout:15000,
   env:{...process.env,AUREL_STORAGE:'json',AUREL_DEMO_DATA_DIR:folder,DEMO_ADMIN_PASSWORD:'unused'}
  });
  assert.equal(child.status,0,child.stderr);
  assert.deepEqual(JSON.parse(child.stdout.trim()),{leases:0,schedules:0,deposit:0});
  const disk=JSON.parse(readFileSync(path.join(folder,'local-demo.json'),'utf8'));
  assert.deepEqual(disk.depositTransactions,[]);
  assert.deepEqual(disk.leases,[]);
 }finally{rmSync(folder,{force:true,recursive:true})}
});

test('V2.56: receipt idempotency replays numeric/string lease IDs but keeps leading zeros distinct',()=>{
 const db=emptyFinance();db.depositTransactions.push({id:'receipt-1',leaseId:7,unitId:8,kind:'receive',
  amount:1000000,idempotencyKey:'deposit-1',note:'Bổ sung'});
 assert.equal(receiveDeposit(db,'7',{amount:1000000,idempotencyKey:'deposit-1',note:'Bổ sung'},actor).id,'receipt-1');
 assert.equal(db.depositTransactions.length,1);
 db.depositTransactions[0].leaseId='07';
 assert.throws(()=>receiveDeposit(db,'7',{amount:1000000,idempotencyKey:'deposit-1',note:'Bổ sung'},actor),/đã được dùng/);
});

test('V2.56: proposal idempotency and pending guard use same persisted lease reference',()=>{
 const db=emptyFinance();db.depositTransactions.push({leaseId:7,unitId:8,kind:'receive',amount:2000000});
 const old={id:'proposal-1',leaseId:7,status:'pending',idempotencyKey:'refund-1',refund:1800000,deduction:200000,note:'Bàn giao'};
 db.depositSettlements=[old];
 assert.equal(submitDepositProposal(db,'7',{idempotencyKey:'refund-1',refund:1800000,deduction:200000,note:'Bàn giao'},actor),old);
 assert.throws(()=>submitDepositProposal(db,'7',{idempotencyKey:'refund-2'},actor),/chờ xử lý/);
 db.depositSettlements[0].leaseId='07';
 assert.throws(()=>submitDepositProposal(db,'7',{idempotencyKey:'refund-1'},actor),/đã dùng/);
});

test('V2.56: read-only quality scan identifies old auto-created cash without altering the ledger',()=>{
 const state=upgrade(seed());
 const old={id:'legacy-auto-cash',leaseId:state.leases[0].id,unitId:state.leases[0].unitId,
  kind:'receive',amount:5000000,note:'Số dư đầu kỳ từ dữ liệu mẫu'};
 state.depositTransactions.push(old);
 const snapshot=structuredClone(state.depositTransactions);
 const reports=scanDataQuality(state,{limit:1000});
 const finding=reports.issues.find(i=>i.code==='UNVERIFIED_LEGACY_DEPOSIT'&&i.id===old.id);
 assert.equal(finding?.severity,'warning');
 assert.match(finding.description,/đối chiếu chứng từ/);
 assert.deepEqual(state.depositTransactions,snapshot,'quality scan must not mutate historic receipts');
 const healthy=scanDataQuality(upgrade(seed()),{limit:1000});
 assert.ok(!healthy.issues.some(i=>i.code==='UNVERIFIED_LEGACY_DEPOSIT'));
});
