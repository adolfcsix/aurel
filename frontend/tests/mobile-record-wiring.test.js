import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const cards=readFileSync(new URL('../src/components/MobileRecords.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/estate-studio.css',import.meta.url),'utf8');
test('V1.3: six mobile lists are mounted in the real React pages',()=>{
 for(const name of ['UnitMobileList','LeaseMobileList','ScheduleMobileList','DepositMobileList','PaymentLedgerMobileList','DepositLedgerMobileList']){
  assert.match(app,new RegExp(`<${name}\\b`),`${name} must not exist only in a standalone preview`);
  assert.match(cards,new RegExp(`export function ${name}\\b`));
 }
});
test('V1.3: mobile UI does not break desktop table and preserves bulk selections',()=>{
 assert.match(app,/aurel-desktop-records/);
 assert.match(css,/\.aurel-desktop-records\{display:none!important\}/);
 assert.match(css,/\.aurel-mobile-records\{display:grid/);
 assert.match(app,/onSelect=\{toggleBulk\}/);
 assert.match(cards,/checked=\{selected\.includes\(u\.id\)\}/);
});
test('V1.3: mobile cards connect to real CRUD and financial handlers',()=>{
 assert.match(app,/onEdit=\{u=>open\('unit',u\)\}/);
 assert.match(app,/onCollect=\{s=>open\('payment'/);
 assert.match(app,/onReceive=\{l=>open\('deposit-receive'/);
 assert.match(app,/onSettle=\{l=>open\('deposit-settle'/);
 assert.match(app,/onRenew=\{l=>open\('renew'/);
});
test('V1.3: viewer-sensitive mobile prices and owner fields are masked',()=>{
 assert.match(app,/showFinancial=\{canSeePortfolioFinancials\}/);
 assert.match(app,/const canSeePortfolioFinancials=can\('payment.write'\)\|\|can\('fee.read'\)/);
 assert.match(cards,/\{showFinancial&&<div className="aurel-record-price"/);
 assert.match(cards,/\{showFinancial&&<><Meta label="Chủ sở hữu"/);
 assert.match(cards,/\{feeLabel\(u\)\}/);
});
