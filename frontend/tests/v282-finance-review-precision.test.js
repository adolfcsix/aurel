import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transactionReview} from '../src/lib/transaction-review.js';

const unit={id:'unit-82',code:'AUREL-82'};
const lease={id:'lease-82',unitId:unit.id,status:'active',endsOn:'2026-11-30'};
const schedule={id:'bill-82',unitId:unit.id,leaseId:lease.id,period:'2026-11',status:'open',amount:12000000};
const data=()=>({units:[unit],leases:[lease],schedules:[schedule],payments:[{scheduleId:schedule.id,status:'posted',amount:2000000}],depositTransactions:[{leaseId:lease.id,kind:'receive',amount:15000000}],depositSettlements:[]});
const review=(kind,draft,context={},db=data())=>transactionReview(kind,draft,{data:db,record:unit,context:{asOf:'2026-11-13',...context}});
const err=(result,fragment)=>result.errors.some(e=>e.includes(fragment));

test('V2.82: receipt preview blocks future and nonexistent calendar dates',()=>{
 const base={amount:1000000,date:'2026-11-13',method:'Chuyển khoản'};
 assert.equal(review('payment',base,{schedule}).valid,true);
 assert.ok(err(review('payment',{...base,date:'2026-11-14'},{schedule}),'tương lai'));
 assert.ok(err(review('payment',{...base,date:'2026-02-30'},{schedule}),'hợp lệ'));
 assert.ok(err(review('payment',{...base,date:'2026-11-00'},{schedule}),'hợp lệ'));
});

test('V2.82: partial payment and outstanding balance retain existing safeguards',()=>{
 const valid=review('payment',{amount:10000000,date:'2026-11-12',method:'Tiền mặt'},{schedule});
 assert.equal(valid.valid,true);
 assert(valid.details.some(row=>row.label==='Còn phải thu trước giao dịch'&&row.value.includes('10.000.000')));
 assert.ok(err(review('payment',{amount:10000001,date:'2026-11-12'},{schedule}),'vượt'));
});

test('V2.82: ended contracts cannot receive additional deposits',()=>{
 const db=data();db.leases[0]={...lease,status:'ended'};
 assert.ok(err(review('deposit-receive',{amount:100000},{lease:db.leases[0]},db),'đã kết thúc'));
 assert.equal(review('deposit-receive',{amount:100000},{lease}).valid,true);
});

test('V2.82: open settlement stops new deposits and duplicate proposals',()=>{
 const db=data();db.depositSettlements=[{leaseId:lease.id,status:'pending'}];
 assert.ok(err(review('deposit-receive',{amount:100000},{lease},db),'chờ xử lý'));
 assert.ok(err(review('deposit-settle',{deduction:0,refund:500000,note:'Hợp lệ'},{lease:{...lease,status:'ended'}},db),'đang xử lý'));
 db.depositSettlements[0].status='rejected';
 assert.equal(review('deposit-receive',{amount:100000},{lease},db).valid,true);
});

test('V2.82: settle proposal must follow lease termination',()=>{
 assert.ok(err(review('deposit-settle',{deduction:0,refund:15000000},{lease}),'đã kết thúc'));
 assert.equal(review('deposit-settle',{deduction:0,refund:15000000},{lease:{...lease,status:'ended'}}).valid,true);
});

test('V2.82: deduction requires a meaningful explanation but zero deduction does not',()=>{
 const ended={...lease,status:'ended'};
 assert.ok(err(review('deposit-settle',{deduction:2000000,refund:13000000,note:' '},{lease:ended}),'căn cứ'));
 assert.equal(review('deposit-settle',{deduction:2000000,refund:13000000,note:'Khấu trừ hư hỏng theo biên bản'},{lease:ended}).valid,true);
 assert.equal(review('deposit-settle',{deduction:0,refund:15000000,note:''},{lease:ended}).valid,true);
});

test('V2.82: fee policy cannot be backdated or use nonexistent date',()=>{
 const fee={feePercent:4.5,feeBasis:'paid',feeEffectiveFrom:'2026-11-13'};
 assert.equal(review('fee',fee).valid,true);
 assert.ok(err(review('fee',{...fee,feeEffectiveFrom:'2026-11-12'}),'hồi tố'));
 assert.ok(err(review('fee',{...fee,feeEffectiveFrom:'2026-02-30'}),'hợp lệ'));
});

test('V2.82: renewal must not overlap current contract',()=>{
 const next={startsOn:'2026-11-30',endsOn:'2027-11-30',rent:12000000,paymentDay:5};
 assert.ok(err(review('renew',next,{lease}),'sau ngày kết thúc'));
 assert.equal(review('renew',{...next,startsOn:'2026-12-01'},{lease}).valid,true);
});

test('V2.82: two-step financial confirm is disabled while review validation fails',()=>{
 const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(source,/disabled=\{conflict\|\|unverified\|\|\(trackedDossier&&!changesPending\)\|\|\(needsReview&&reviewVisible&&!review\.valid\)\}/);
 assert.match(source,/setReviewVisible\(false\);setDraft/);
});

test('V2.82: evidence refresh failure warns against duplicate uploads',()=>{
 const source=readFileSync(new URL('../src/components/ReceiptEvidence.jsx',import.meta.url),'utf8');
 assert.match(source,/accepted=true/);
 assert.match(source,/refreshed===false/);
 assert.match(source,/không tải lên lần nữa/);
 assert.match(source,/err\.uncertain/);
 assert.match(source,/const file=e\.target\.files\?\.\[0\]/);
});

test('V2.82: deposit buttons mirror server state on desktop, dossier and mobile',async()=>{
 const {depositActions}=await import('../src/lib/finance.js');
 const db=data();
 assert.deepEqual(depositActions(db,lease),{receive:true,propose:false});
 const ended={...lease,status:'ended'};
 assert.deepEqual(depositActions(db,ended),{receive:false,propose:true});
 db.depositSettlements=[{leaseId:lease.id,status:'pending'}];
 assert.deepEqual(depositActions(db,ended),{receive:false,propose:false});
 assert.deepEqual(depositActions(db,lease),{receive:false,propose:false});
 db.depositSettlements[0].status='rejected';
 assert.deepEqual(depositActions(db,ended),{receive:false,propose:true});
 db.depositTransactions=[];
 assert.deepEqual(depositActions(db,ended),{receive:false,propose:false});
 assert.deepEqual(depositActions(db,null),{receive:false,propose:false});
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const mobile=readFileSync(new URL('../src/components/MobileRecords.jsx',import.meta.url),'utf8');
 const dossier=readFileSync(new URL('../src/components/PropertyDossier.jsx',import.meta.url),'utf8');
 assert.match(app,/depositActions\(data,l\)\.receive/);
 assert.match(app,/depositActions\(data,l\)\.propose/);
 assert.match(app,/canReceive=\{l=>depositActions\(data,l\)\.receive\}/);
 assert.match(mobile,/canEdit&&\(canReceive\(l\)\|\|canSettle\(l\)\)/);
 assert.match(dossier,/depositActions\(data,l\)\.receive/);
});
