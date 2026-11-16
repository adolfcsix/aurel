import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bill,periodTotals} from '../src/lib/finance.js';

test('V1.5: fees from actual receipts cannot exceed the fee for rent due',()=>{
 const schedule={id:'schedule-01',period:'2026-11',amount:1_000_000,feePercent:6,feeBasis:'paid',status:'open'};
 const d={schedules:[schedule],payments:[{scheduleId:schedule.id,amount:1_350_000,status:'posted'}],depositTransactions:[]};
 assert.equal(bill(d,schedule).fee,60_000);
 assert.equal(bill(d,schedule).left,0);
 assert.equal(periodTotals(d,'2026-11').fee,60_000);
});

test('V1.5: reversed receipts do not count as income or generate a paid fee',()=>{
 const schedule={id:'schedule-01',period:'2026-11',amount:1_000_000,feePercent:6,feeBasis:'paid',status:'open'};
 const d={schedules:[schedule],payments:[{scheduleId:schedule.id,amount:500_000,status:'reversed'}],depositTransactions:[]};
 assert.equal(bill(d,schedule).paid,0);
 assert.equal(bill(d,schedule).fee,0);
 assert.equal(bill(d,schedule).left,1_000_000);
});

test('V1.5: mobile cards do not drop a true zero value and provide visible keyboard focus',()=>{
 const src=readFileSync(new URL('../src/components/MobileRecords.jsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/estate-studio.css',import.meta.url),'utf8');
 assert.match(src,/children===null\|\|children===undefined\|\|children===''/);
 assert.match(css,/\.aurel-record-card :is\(button,input,select,a\):focus-visible/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});

test('V1.5: main apartment action is first and occupies a full mobile row',()=>{
 const src=readFileSync(new URL('../src/components/MobileRecords.jsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/estate-studio.css',import.meta.url),'utf8');
 const first=src.slice(src.indexOf('export function UnitMobileList'),src.indexOf('export function LeaseMobileList'));
 assert.ok(first.indexOf('<Footer><button type="button" className="aurel-record-action"')<first.indexOf('aurel-record-select'));
 assert.match(css,/\.aurel-unit-card \.aurel-record-action\{grid-column:1\/-1;grid-row:1/);
 assert.match(first,/onClick=\{\(\)=>onOpen\(u\.id\)\}/);
 assert.match(first,/onClick=\{\(\)=>onEdit\(u\)\}/);
});

test('V1.5: internal navigation does not reuse the diagonal outbound-link icon',()=>{
 const root=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const overview=readFileSync(new URL('../src/components/ExecutiveOverview.jsx',import.meta.url),'utf8');
 assert.doesNotMatch(root,/Icon name="up"/);
 assert.doesNotMatch(overview,/Icon name="up"/);
 assert.match(root,/Chưa thiết lập/);
});
