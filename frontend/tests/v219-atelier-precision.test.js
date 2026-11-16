import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeVietnamese,filterProposalDesk,firstPage} from '../src/lib/atelier-precision.js';

const root=new URL('../src/',import.meta.url);
const read=file=>readFileSync(new URL(file,root),'utf8');

test('V2.19: Vietnamese search works with accents, casing and Đ/đ',()=>{
 assert.equal(normalizeVietnamese('  ĐỀ NGHỊ hoàn CỌC '),'de nghi hoan coc');
 assert.equal(normalizeVietnamese('Căn Đ-12'),'can d-12');
 assert.equal(normalizeVietnamese(null),'');
});

test('V2.19: workbench searches only its already-authorized rows',()=>{
 const rows=[{id:'p1',unitId:'a',createdBy:'m1',status:'pending'},
  {id:'p2',unitId:'b',createdBy:'m2',status:'approved'},
  {id:'p3',unitId:'c',createdByName:'Nguyễn Hà',status:'executed'}];
 const units=[{id:'a',code:'Căn Đ-12'},{id:'b',code:'A-1002'},{id:'c',code:'C-003'},{id:'hidden',code:'SECRET-PROPERTY'}];
 const users=[{id:'m1',name:'Đỗ Minh'},{id:'m2',name:'Phạm Vân'}];
 assert.deepEqual(filterProposalDesk(rows,units,users,'do minh').map(x=>x.id),['p1']);
 assert.deepEqual(filterProposalDesk(rows,units,users,'can d-12').map(x=>x.id),['p1']);
 assert.deepEqual(filterProposalDesk(rows,units,users,'cho xac nhan chi').map(x=>x.id),['p2']);
 assert.deepEqual(filterProposalDesk(rows,units,users,'nguyen ha').map(x=>x.id),['p3']);
 assert.deepEqual(filterProposalDesk(rows,units,users,'secret-property').map(x=>x.id),[]);
 assert.equal(filterProposalDesk(rows,units,users,'').length,3);
 assert.equal(rows.length,3,'input is never mutated');
});

test('V2.19: incremental cards honor bounds and never mutate or invent records',()=>{
 const rows=Array.from({length:27},(_,i)=>({id:`proposal-${i}`}));
 assert.equal(firstPage(rows).length,6);
 assert.equal(firstPage(rows,12).length,12);
 assert.equal(firstPage(rows,0).length,6);
 assert.equal(firstPage(rows,99).length,27);
 assert.equal(rows.length,27);
});

test('V2.19: shared button communicates pending state and field IDs are per instance',()=>{
 const ui=read('components/Ui.jsx');
 assert.match(ui,/aria-busy=\{busy\|\|undefined\}/);
 assert.match(ui,/disabled=\{disabled\|\|busy\}/);
 assert.match(ui,/const reactId=useId\(\)/);
 assert.match(ui,/htmlFor=\{id\}/);
 assert.match(ui,/aria-describedby/);
 assert.doesNotMatch(ui,/id='field-'\+field\.name/);
});

test('V2.19: actual React entry imports design system and financial desk refinement',()=>{
 const main=read('main.jsx');
 const workbench=read('components/ApprovalWorkbench.jsx');
 const app=read('App.jsx');
 assert.match(main,/atelier-v219\.css/);
 assert.match(workbench,/filterProposalDesk\(/);
 assert.match(workbench,/firstPage\(rows,visibleCount\)/);
 assert.match(workbench,/type="search"/);
 assert.match(workbench,/aurel-workbench-more/);
 assert.match(app,/actionInFlight\.current/);
 assert.match(app,/e\.status===409/);
 assert.match(app,/toast\.persistent/);
 assert.match(app,/aurel-feedback/);
});

test('V2.19: account keyboard navigation and lease dialog focus restoration are present',()=>{
 const menu=read('components/AccountMenu.jsx');
 const lease=read('components/CloseLeaseDialog.jsx');
 assert.match(menu,/ArrowDown/);assert.match(menu,/ArrowUp/);
 assert.match(menu,/aria-haspopup="menu"/);assert.match(menu,/trigger\.current\?\.focus/);
 assert.match(lease,/aria-modal="true"/);
 assert.match(lease,/document\.body\.style\.overflow=old/);
 assert.match(lease,/containModalTab\(e,dialogRef\.current/);
 assert.match(lease,/disabled=\{busy\}/);
});

test('V2.19: tactile and contrast tokens are explicit, reduced motion is supported',()=>{
 const css=read('atelier-v219.css');
 assert.match(css,/--aurel-control-height:\s*44px/);
 assert.match(css,/--aurel-font:/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(css,/safe-area-inset-bottom/);
 assert.match(css,/\.btn\.is-busy/);
});
