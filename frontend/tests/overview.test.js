import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../../backend/src/seed.js';
import {upgrade} from '../../backend/src/store.js';
import {getPortfolioOverview,daysUntil} from '../src/lib/overview.js';
import {periodTotals} from '../src/lib/finance.js';
const sample=()=>upgrade(seed());

test('V0.9: executive projection matches original ledger and deposit accounting',()=>{
 const db=sample(),view=getPortfolioOverview(db,'2026-11','2026-11-11');
 assert.deepEqual(view.totals,periodTotals(db,'2026-11'));
 assert.equal(view.units,8);assert.equal(view.occupied,7);assert.equal(view.vacant,1);
 assert.equal(view.escrow,149400000);assert.equal(view.projectIndex.length,3);
 assert.equal(view.collectionRate,Math.round(view.totals.paid/view.totals.due*100));
});
test('V0.9: no false overdue for a cancelled or fully paid schedule',()=>{
 const db=sample(),s=db.schedules.find(s=>s.period==='2026-11'&&s.status==='open'&&s.unitId==='u2');
 s.dueOn='2026-11-02';s.status='cancelled';
 const view=getPortfolioOverview(db,'2026-11','2026-11-11');
 assert.ok(!view.overdue.some(x=>x.id===s.id));
});
test('V0.9: date calculations reject malformed or impossible dates',()=>{
 assert.equal(daysUntil('2026-11-12','2026-11-11'),1);
 assert.equal(daysUntil('2026-11-10','2026-11-11'),-1);
 assert.equal(daysUntil('2026-02-30','2026-02-01'),null);
 assert.equal(daysUntil('not-a-date','2026-11-11'),null);
});
test('V0.9: vacant and missing data do not crash the executive workspace',()=>{
 const db=sample();db.projects=[];db.units=[];db.leases=[];db.schedules=[];db.payments=[];db.depositTransactions=[];
 const state=getPortfolioOverview(db,'2026-11','2026-11-11');
 assert.equal(state.units,0);assert.equal(state.collectionRate,0);assert.equal(state.tasks.length,0);assert.equal(state.escrow,0);
});
test('V0.9: executive projection is read only and project counts agree with unit count',()=>{
 const db=sample(),before=structuredClone(db);
 const state=getPortfolioOverview(db,'2026-11','2026-11-11');
 assert.deepEqual(db,before);
 assert.equal(state.projectIndex.reduce((n,p)=>n+p.count,0),db.units.length);
});
test('V0.9: after a reversal, reporting uses only posted receipt amounts',()=>{
 const db=sample(),period='2026-11',before=getPortfolioOverview(db,period,'2026-11-11');
 const receipt=db.payments.find(p=>p.status==='posted'&&p.scheduleId);
 assert.ok(receipt);receipt.status='reversed';
 const after=getPortfolioOverview(db,period,'2026-11-11');
 assert.equal(after.totals.paid,before.totals.paid-receipt.amount);
 assert.equal(after.totals.left,before.totals.left+receipt.amount);
});

test('V0.9: deposit still held after a lease ends remains in escrow, not rental income',()=>{
 const db=sample(),l=db.leases.find(l=>l.status==='active');
 const before=getPortfolioOverview(db,'2026-11','2026-11-11');
 l.status='ended';
 const after=getPortfolioOverview(db,'2026-11','2026-11-11');
 assert.equal(after.escrow,before.escrow);
 assert.deepEqual(after.totals,before.totals);
});
