import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {sameDossierId} from '../src/lib/dossier-id.js';
import {posted,bill,balance,periodTotals} from '../src/lib/finance.js';
import {estateJourney} from '../src/lib/estate-journey.js';
import {getOperationsSnapshot} from '../src/lib/operations.js';
import {getPortfolioOverview} from '../src/lib/overview.js';
import {transactionReview} from '../src/lib/transaction-review.js';
import {rolePermissions} from '../src/lib/finance.js';
import {ROLE_PERMISSIONS} from '../../backend/src/security.js';

const mixed=()=>({
 projects:[{id:'70',name:'AUREL Test',status:'active'}],
 units:[{id:7,code:'AX-07',projectId:'70',managerId:'3',status:'occupied'},{id:'07',code:'AX-007',projectId:'70',managerId:'03',status:'occupied'}],
 leases:[{id:8,unitId:'7',status:'active',endsOn:'2026-11-27',startsOn:'2026-01-01',rent:4000000},{id:'08',unitId:'07',status:'active',endsOn:'2026-12-29'}],
 schedules:[{id:9,leaseId:'8',unitId:'7',period:'2026-11',dueOn:'2026-11-15',status:'open',amount:4000000,feePercent:10,feeBasis:'paid'},{id:'09',leaseId:'08',unitId:'07',period:'2026-11',dueOn:'2026-11-17',status:'open',amount:2000000,feePercent:10,feeBasis:'due'}],
 payments:[{id:1,scheduleId:'9',status:'posted',amount:1500000},{id:2,scheduleId:'09',status:'posted',amount:200000},{id:3,scheduleId:9,status:'reversed',amount:500000}],
 depositTransactions:[{id:1,leaseId:'8',kind:'receive',amount:6000000},{id:2,leaseId:8,kind:'settle',amount:1000000},{id:3,leaseId:'08',kind:'receive',amount:1500000}],
 depositSettlements:[],feeHistory:[],staff:[{id:3,name:'Người A',status:'active'},{id:'03',name:'Người B',status:'active'}],
 buildings:[],floors:[],rooms:[],clients:[],preferences:{company:'AUREL',reminderDays:5}
});
const src=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('V2.47 joins only identical persisted IDs: 7 and "7" match, 07 does not',()=>{
 assert.equal(sameDossierId(7,'7'),true);
 assert.equal(sameDossierId(7,'07'),false);
 for(const id of ['',null,undefined,NaN,Infinity])assert.equal(sameDossierId(7,id),false);
});
test('V2.47 rent payments preserve posted/reversed semantics across imported IDs',()=>{
 const d=mixed();assert.equal(posted(d,d.schedules[0]),1500000);assert.equal(posted(d,d.schedules[1]),200000);
 assert.equal(bill(d,d.schedules[0]).left,2500000);
 assert.equal(bill(d,d.schedules[0]).fee,150000);
 assert.equal(bill(d,d.schedules[1]).fee,200000);
});
test('V2.47 period totals reconcile both identities without cross-contaminating leading-zero records',()=>{
 const d=mixed(),before=structuredClone(d);
 assert.deepEqual(periodTotals(d,'2026-11'),{due:6000000,paid:1700000,left:4300000,fee:350000});
 assert.deepEqual(d,before,'read-only calculation may not mutate evidence');
});
test('V2.47 escrow balance never merges 8 and 08 or reverses deposit settlement signs',()=>{
 const d=mixed();assert.equal(balance(d,'8'),5000000);assert.equal(balance(d,8),5000000);
 assert.equal(balance(d,'08'),1500000);assert.equal(balance(d,undefined),0);
});
test('V2.47 dossier journey associates the correct rent cycle and renewal for legacy IDs',()=>{
 const d=mixed();const first=estateJourney(d.units[0],d,{showFinancial:true,can:()=>true});
 assert.equal(first.stages[1].status,'Đang hiệu lực');assert.equal(first.stages[2].status,'Có kỳ cần thu');
 assert.equal(first.next.action,'payment');assert.equal(first.next.schedule.id,9);
 const second=estateJourney(d.units[1],d,{showFinancial:true,can:()=>true});assert.equal(second.next.schedule.id,'09');
});
test('V2.47 operational workload and escrow use shared identity without changing stored amounts',()=>{
 const d=mixed(),s=getOperationsSnapshot(d,'2026-11','2026-11-12');
 assert.equal(s.staff.assigned,2);assert.equal(s.deposits.held,6500000);
 assert.equal(s.payments.paid,1700000);assert.equal(s.payments.left,4300000);
});
test('V2.47 executive dashboard matches reconciled receipts and project assignments',()=>{
 const d=mixed();const s=getPortfolioOverview(d,'2026-11','2026-11-12');
 assert.equal(s.escrow,6500000);assert.equal(s.totals.paid,1700000);
 assert.equal(s.projectIndex[0].count,2);assert.equal(s.collectionRate,28);
});
test('V2.47 payment confirmation identifies correct unit for mixed schedule identifier',()=>{
 const d=mixed();const r=transactionReview('payment',{amount:100000,date:'2026-11-12',method:'cash'},{data:d,context:{schedule:d.schedules[0]}});
 assert.equal(r.details.find(x=>x.label==='Căn hộ').value,'AX-07');assert.equal(r.valid,true);
});
test('V2.47 deposit and renewal confirmations identify correct unit',()=>{
 const d=mixed(),lease=d.leases[0];
 const deposit=transactionReview('deposit-receive',{amount:100000},{data:d,context:{lease}});
 assert.equal(deposit.details.find(x=>x.label==='Căn hộ').value,'AX-07');
 const renewal=transactionReview('renew',{rent:5000000,paymentDay:5,startsOn:'2026-12-01',endsOn:'2027-01-31'}, {data:d,context:{lease}});
 assert.equal(renewal.details.find(x=>x.label==='Căn hộ').value,'AX-07');
});
test('V2.47 financial read models do not modify payment records or deposit transactions',()=>{
 const d=mixed(),before=structuredClone(d);
 estateJourney(d.units[0],d,{can:()=>true});getPortfolioOverview(d,'2026-11','2026-11-12');
 getOperationsSnapshot(d,'2026-11','2026-11-12');transactionReview('deposit-settle',{refund:500000,deduction:0},{data:d,context:{lease:d.leases[0]}});
 assert.deepEqual(d,before);
});
test('V2.47 frontend/backend role permissions have no drift',()=>{
 assert.deepEqual(Object.keys(rolePermissions).sort(),Object.keys(ROLE_PERMISSIONS).sort());
 for(const role of Object.keys(rolePermissions))assert.deepEqual([...rolePermissions[role]].sort(),[...ROLE_PERMISSIONS[role]].sort(),role);
});
test('V2.47 approved logo bytes are unchanged and shared by login and sidebar',()=>{
 const img=readFileSync(new URL('../public/images/aurel-selected-wordmark.png',import.meta.url));
 const sha=createHash('sha256').update(img).digest('hex');
 assert.equal(sha,'beee7e52cc28b25e3151248d80e1a620f36f667b918600c2268c024872bcef55');
 assert.match(src('../src/components/BrandWordmark.jsx'),/aurel-selected-wordmark\.png/);
 assert.match(src('../src/App.jsx'),/import BrandWordmark/);
 assert.match(src('../src/App.jsx'),/className="brand aurel-brand-panel"/);
 assert.match(src('../src/App.jsx'),/aria-label="Về tổng quan AUREL"/);
 assert.match(src('../src/components/AuthPortal.jsx'),/aurel-auth-brand--image"><BrandWordmark\/>/);
 assert.match(src('../src/atelier-v233.css'),/V2\.45 — Approved AUREL identity/);
 assert.doesNotMatch(src('../src/App.jsx'),/className="brand-emblem"/);
});
test('V2.47 read-only finance, staff workload and review UI are on the same ID contract',()=>{
 for(const [p,needles] of [
  ['../src/lib/finance.js',['sameDossierId(p.scheduleId,s.id)','sameDossierId(x.leaseId,leaseId)']],
  ['../src/lib/operations.js',['sameDossierId(s.id,u.managerId)']],
  ['../src/components/PropertyDossier.jsx',['sameDossierId(f.unitId,unit.id)']],
  ['../src/lib/transaction-review.js',['findDossierRow(data?.units']],
  ['../src/App.jsx',['sameDossierId(s.unitId,u.id)','sameDossierId(x.scheduleId,s.id)']]
 ])for(const needle of needles)assert.ok(src(p).includes(needle),`${p} -> ${needle}`);
});
