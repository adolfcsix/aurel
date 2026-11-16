import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildQuickFindIndex,canNavigate,findQuickResults,normalizeQuery} from '../src/lib/quick-find.js';

const sections=[{id:'dashboard',label:'Tổng quan',icon:'dashboard',group:'Không gian làm việc'},{id:'clients',label:'Chủ sở hữu & khách thuê',icon:'people',group:'Hồ sơ'},{id:'payments',label:'Thanh toán & công nợ',icon:'payments',group:'Tài chính'},{id:'quality',label:'Kiểm tra dữ liệu',icon:'shield',group:'Quản trị'}];
const db={
 projects:[{id:'p1',name:'Thảo Điền Residence',city:'TP.HCM',address:'Thảo Điền'}],
 units:[{id:'u1',code:'A-1208',projectId:'p1',building:'Tòa A',floor:'12',room:'08',address:'Thảo Điền',owner:'Nguyễn Hà',tenant:'Lê Phương'}],
 leases:[{id:'l1',unitId:'u1',tenantName:'Lê Phương',endsOn:'2027-01-01'}],
 clients:[{id:'c1',name:'Nguyễn Hà',phone:'0900000000',code:'OWNER-01',type:'owner'}]
};
const manager={role:'manager',id:'m1'};
const viewer={role:'viewer',id:'v1'};
test('Vietnamese accent and d/đ variants resolve to one search expression',()=>{
 assert.equal(normalizeQuery('  THẢO  ĐiỀN '),'thao dien');
 assert.equal(normalizeQuery('ĐƯỜNG SỐ 1'),'duong so 1');
});
test('private search covers project, inventory, contract and client records',()=>{
 const index=buildQuickFindIndex(db,manager,sections);
 assert.equal(findQuickResults(index,'a-1208')[0].kind,'unit');
 assert.equal(findQuickResults(index,'thao dien').some(x=>x.kind==='project'),true);
 assert.equal(findQuickResults(index,'2027-01-01')[0].kind,'lease');
 assert.equal(findQuickResults(index,'hợp đồng a-1208')[0].kind,'lease');
 assert.equal(findQuickResults(index,'0900000000')[0].kind,'client');
});
test('viewer cannot query client records or owner and tenant names through inventory text',()=>{
 assert.equal(canNavigate(viewer,'clients'),false);
 assert.equal(canNavigate(viewer,'payments'),false);
 const index=buildQuickFindIndex(db,viewer,sections);
 assert.equal(index.some(x=>x.kind==='client'),false);
 assert.equal(findQuickResults(index,'nguyen ha').length,0);
 assert.equal(findQuickResults(index,'le phuong').length,0);
 assert.equal(findQuickResults(index,'0900000000').length,0);
 assert.equal(findQuickResults(index,'a-1208')[0].kind,'unit');
});
test('search is limited to user-scoped records and does not fabricate matches',()=>{
 const scoped={projects:[],units:[],leases:[],clients:[]};
 const index=buildQuickFindIndex(scoped,{role:'staff'},sections);
 assert.equal(findQuickResults(index,'A-1208').length,0);
 assert.equal(findQuickResults(index,'sở hữu')[0].kind,'section');
 assert.equal(findQuickResults(index,'not-a-match').length,0);
});
test('result ordering prefers direct inventory and exact title matches and caps results',()=>{
 const index=buildQuickFindIndex(db,manager,sections);
 assert.equal(findQuickResults(index,'A-1208')[0].kind,'unit');
 assert.equal(findQuickResults(index,'',3).length,3);
 assert.equal(findQuickResults(index,'Thảo Điền',1).length,1);
});
test('permission boundary preserves assigned payment follow-up without granting client access',()=>{
 assert.equal(canNavigate({role:'accountant'},'clients'),false);
 assert.equal(canNavigate({role:'staff'},'payments'),true);
 assert.equal(canNavigate({role:'staff'},'quality'),false);
 assert.equal(canNavigate(manager,'quality'),true);
 assert.equal(canNavigate(viewer,'archives'),false);
});
test('search UI has genuine modal, keyboard choice, focus restoration and mobile styling',()=>{
 const code=readFileSync(new URL('../src/components/PrivateSearch.jsx',import.meta.url),'utf8');
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/atelier-v216.css',import.meta.url),'utf8');
 assert.match(code,/aria-modal="true"/);
 assert.match(code,/aria-activedescendant=/);
 assert.match(code,/event\.key==='Escape'/);
 assert.match(code,/event\.key==='Enter'/);
 assert.match(code,/previous\.focus/);
 assert.match(code,/onOpenUnit\(item\.unitId\)/);
 assert.match(app,/showPrivateSearch&&<PrivateSearch/);
 assert.match(app,/canNavigate\(user,key\)/);
 assert.match(app,/aurel-skip-link/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
