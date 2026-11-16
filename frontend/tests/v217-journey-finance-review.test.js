import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {estateJourney} from '../src/lib/estate-journey.js';
import {requiresReview,transactionReview} from '../src/lib/transaction-review.js';
const unit={id:'u1',code:'A-1802'};
const lease={id:'l1',unitId:'u1',startsOn:'2026-11-01',endsOn:'2027-10-31',rent:15000000,status:'active',depositExpected:30000000};
const schedule={id:'s1',unitId:'u1',leaseId:'l1',period:'2026-11',dueOn:'2026-11-05',amount:15000000,status:'open'};
const data=()=>({units:[unit],leases:[lease],schedules:[schedule],payments:[{id:'p1',scheduleId:'s1',status:'posted',amount:5000000}],depositTransactions:[{id:'t1',leaseId:'l1',kind:'receive',amount:30000000}]});
const can=permission=>['lease.write','payment.write'].includes(permission);

test('journey identifies active contract and outstanding period from ledger, not mocked text',()=>{
 const v=estateJourney(unit,data(),{can});
 assert.equal(v.stages[1].status,'Đang hiệu lực');assert.equal(v.stages[2].status,'Có kỳ cần thu');
 assert.equal(v.next.action,'payment');assert.equal(v.next.schedule.id,'s1');
});
test('journey proposes creating a contract only when the user can write contracts',()=>{
 const d=data();d.leases=[];d.schedules=[];
 assert.equal(estateJourney(unit,d,{can}).next.action,'lease');
 assert.notEqual(estateJourney(unit,d,{can:()=>false}).next.action,'lease');
});
test('unfinished contract opens the existing draft instead of creating a duplicate',()=>{
 const d=data();d.leases=[{...lease,status:'draft'}];d.schedules=[];
 const v=estateJourney(unit,d,{can});
 assert.equal(v.next.action,'edit-lease');assert.equal(v.next.record.id,'l1');
});
test('viewer dossier does not include a finance step or a financial next-action',()=>{
 const v=estateJourney(unit,data(),{can:()=>false,showFinancial:false});
 assert.deepEqual(v.stages.map(s=>s.tab),['overview','lease']);
 assert.notEqual(v.next.action,'payment');
});
test('payment review shows outstanding debt after posted partial payment',()=>{
 const v=transactionReview('payment',{amount:10000000,date:'2026-11-11',method:'Chuyển khoản',reference:'TXN-18'},{data:data(),context:{schedule}});
 assert.equal(v.valid,true);assert.equal(v.action,'Ghi nhận khoản thu');
 assert(v.details.some(x=>x.label==='Còn phải thu trước giao dịch'&&x.value.includes('10.000.000')));
});
test('payment review prevents posting more than balance, invalid cents, missing date',()=>{
 const v=transactionReview('payment',{amount:10000001,date:'2026-11-11',method:'Tiền mặt'},{data:data(),context:{schedule}});
 assert.equal(v.valid,false);assert(v.errors.some(x=>x.includes('vượt')));
 const cents=transactionReview('payment',{amount:125.5,date:'',method:'Khác'},{data:data(),context:{schedule}});
 assert(cents.errors.some(x=>x.includes('số nguyên')));assert(cents.errors.some(x=>x.includes('ngày')));
});
test('deposit receipt review isolates deposits from rent income',()=>{
 const v=transactionReview('deposit-receive',{amount:1000000},{data:data(),context:{lease}});
 assert.equal(v.valid,true);assert.match(v.note,/không tính là doanh thu/);
 assert(v.details.some(x=>x.value.includes('30.000.000')));
});
test('deposit proposal review never calls it a paid disbursement',()=>{
 const v=transactionReview('deposit-settle',{deduction:2000000,refund:28000000,note:'Trừ tiền sửa chữa'},{data:data(),context:{lease:{...lease,status:'ended'}}});
 assert.equal(v.valid,true);assert.match(v.action,/đề nghị/);assert.match(v.note,/chưa được chi/i);
 assert(v.details.some(x=>x.label==='Số dư dự kiến còn lại'&&x.value.includes('0')));
});
test('deposit proposal disallows oversettlement and negative or fractional values',()=>{
 const large=transactionReview('deposit-settle',{deduction:6000000,refund:25000000,note:'Trừ tiền sửa chữa'},{data:data(),context:{lease}});
 assert.equal(large.valid,false);assert(large.errors.some(x=>x.includes('vượt')));
 const negative=transactionReview('deposit-settle',{deduction:-1,refund:30000000.5,note:'Đối trừ đã có chứng từ'},{data:data(),context:{lease}});
 assert(negative.errors.some(x=>x.includes('số nguyên')));
});
test('active contracts are reviewed while drafts can be saved without mandatory fields',()=>{
 assert.equal(requiresReview('lease',{status:'draft'}),false);
 assert.equal(requiresReview('lease',{status:'active'}),true);
 const contract=transactionReview('lease',{status:'active',unitId:'u1',rent:15000000,depositExpected:0,startsOn:'2027-04-01',endsOn:'2026-12-01',paymentDay:2},{data:data()});
 assert.equal(contract.valid,false);assert(contract.errors.some(x=>x.includes('Thời hạn')));
});
test('activation cannot accept a missing rent even when a draft may omit it',()=>{
 const v=transactionReview('lease',{status:'active',unitId:'u1',rent:'',depositExpected:0,startsOn:'2026-11-01',endsOn:'2027-11-01',paymentDay:1},{data:data()});
 assert.equal(v.valid,false);assert(v.errors.some(x=>x.includes('giá thuê')));
});
test('financial policy review preserves explicit zero percent and blank inheritance',()=>{
 const d=data();const zero=transactionReview('fee',{feePercent:0,feeBasis:'due',feeEffectiveFrom:'2026-12-01'},{data:d,record:unit});
 const inherited=transactionReview('fee',{feePercent:'',feeBasis:'paid',feeEffectiveFrom:'2026-12-01'},{data:d,record:unit});
 assert.equal(zero.valid,true);assert(zero.details.some(x=>x.value==='0%'));
 assert(inherited.details.some(x=>x.value==='Kế thừa mặc định'));
});
test('desktop and mobile use dedicated decisions; financial commit uses review step',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const modal=readFileSync(new URL('../src/components/DecisionDialog.jsx',import.meta.url),'utf8');
 const confirm=readFileSync(new URL('../src/components/ConfirmDialog.jsx',import.meta.url),'utf8');
 const dossier=readFileSync(new URL('../src/components/PropertyDossier.jsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/atelier-v217.css',import.meta.url),'utf8');
 assert(!app.includes('window.prompt('));
 assert.match(app,/requestDecision\('reverse',p\)/);assert.match(app,/requestDecision\('reject',p\)/);assert.match(app,/requestDecision\('execute',p\)/);
 assert.match(app,/reviewVisible&&needsReview/);assert.match(app,/if\(!review\.valid\)return/);
 assert.match(app,/import ConfirmDialog from/);assert.match(confirm,/details\.facts/);assert.match(app,/role=\{toast\.error\?'alert':'status'\}/);
 assert.match(modal,/aria-modal="true"/);assert.match(modal,/inputRef\.current\?\.focus/);
 assert.match(modal,/minimum:4/);assert.match(modal,/minimum:5/);
 // V2.38 replaces duplicate journey cards with the existing dossier tabs.
 assert.match(dossier,/className="v09-dossier-tabs"/);
 assert.match(dossier,/changeTab\(key\)/);
 assert.match(css,/@media\(max-width:600px\)/);assert.match(css,/prefers-reduced-motion/);
});
