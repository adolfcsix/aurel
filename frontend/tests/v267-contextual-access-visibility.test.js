import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canNavigate,buildQuickFindIndex} from '../src/lib/quick-find.js';
import {visibleNavigationGroups,lockedPersonalFeatures} from '../src/lib/navigation-shell.js';
import {allowed} from '../src/lib/finance.js';
import {hasPermission} from '../../backend/src/security.js';
import {stateResponse} from '../../backend/src/state-access.js';

const viewer={id:'u-self',role:'viewer',favoriteUnitIds:['unit-7']};
const source=file=>readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
const backoffice=['leases','payments','fees','deposits','reminders','clients','staff','reports','quality','audit','archives','imports','settings'];

test('V2.67 viewer navigation: usable basics, one locked ownership preview, administration fully hidden',()=>{
 for(const route of ['dashboard','units','projects','profile'])assert.equal(canNavigate(viewer,route),true,route);
 for(const route of backoffice)assert.equal(canNavigate(viewer,route),false,route);
 const locked=lockedPersonalFeatures(viewer);
 assert.equal(locked.length,1,'avoid cluttering the navigation with fake locked internal tools');
 assert.equal(locked[0].key,'owned-assets');
 assert.match(locked[0].reason,/quyền sở hữu.*xác minh/);
 assert.equal(canNavigate(viewer,locked[0].key),false,'the preview is not a route');
 assert.equal(locked.some(x=>/thanh toán|hoàn cọc|phân quyền|nhân viên/i.test(x.label)),false);
 const groups=visibleNavigationGroups([{name:'A',items:[['dashboard','Tổng quan'],['units','Căn hộ'],['payments','Khoản thu']]},{name:'B',items:[['staff','Nhân viên'],['settings','Phân quyền']]}],viewer,canNavigate);
 assert.deepEqual(groups.map(g=>g.items.map(x=>x[0])),[['dashboard','units']]);
});

test('V2.67 lock is a real disabled control with visible icon and explanatory text, not a clickable route',()=>{
 const app=source('App.jsx');
 assert.match(app,/lockedPersonalFeatures\(user\)/);
 assert.match(app,/className="nav-item aurel-locked-feature" disabled aria-disabled="true"/);
 assert.match(app,/<Icon name="lock" size=\{15\}\/>/);
 assert.match(app,/Lưu căn quan tâm không cấp quyền quản lý/);
 assert.match(app,/\{lockedFeatures\.length>0&&<section/);
 const css=source('atelier-v233.css');
 assert.match(css,/aurel-locked-feature:disabled/);
 assert.match(css,/cursor:not-allowed/);
 assert.match(source('components/Ui.jsx'),/lock:'M5 10V7/);
});

test('V2.67 only viewer sees locked personal entitlement; other roles keep their real workflows',()=>{
 for(const role of ['admin','manager','accountant','staff','unknown'])assert.deepEqual(lockedPersonalFeatures({role}),[],role);
 assert.deepEqual(lockedPersonalFeatures(null),[]);
 assert.equal(canNavigate({role:'manager'},'payments'),true);
 assert.equal(canNavigate({role:'accountant'},'deposits'),true);
 assert.equal(canNavigate({role:'admin'},'settings'),true);
 for(const role of ['viewer','staff','accountant','manager','admin']){
  assert.equal(canNavigate({role},'owned-assets'),false,'a placeholder must not become a live admin/owner route');
  assert.equal(canNavigate({role},'unrecognized-section'),false,'unknown routes must fail closed');
 }
});

test('V2.67 bookmarking never grants unit or deposit write and cannot leak search index',()=>{
 const sample={projects:[{id:'p',name:'Công viên'}],units:[{id:'unit-7',projectId:'p',code:'A-07'}],clients:[],leases:[{id:'lease-1',unitId:'unit-7',tenantName:'SECRET'}]};
 const idx=buildQuickFindIndex(sample,viewer,[{id:'owned-assets',label:'Tài sản của tôi'},{id:'payments',label:'Thu tiền'},{id:'units',label:'Danh mục căn hộ'}]);
 assert.equal(idx.some(x=>x.target==='owned-assets'||x.target==='payments'||x.kind==='lease'),false);
 assert.equal(idx.some(x=>x.searchText?.includes('SECRET')),false);
 assert.equal(idx.some(x=>x.unitId==='unit-7'),true);
 for(const perm of ['unit.write','client.write','payment.write','deposit.write','deposit.approve','deposit.execute','settings.write','staff.write']){
  assert.equal(allowed(viewer,perm),false,perm);
  assert.equal(hasPermission(viewer,perm),false,perm);
 }
});

test('V2.67 backend viewer state does not expose confidential financial data or client contacts',()=>{
 const db={projects:[],buildings:[],floors:[],rooms:[],staff:[],clients:[{id:3,name:'Private',phone:'000'}],units:[{id:'unit-7',code:'A-07',ownerId:3,rent:1000000,notes:'private'}],leases:[],schedules:[],payments:[{id:'secret',amount:2000000}],paymentAttachments:[],depositTransactions:[],depositSettlements:[],feeHistory:[],reminderContacts:[],reminderNotifications:[],users:[],sessions:[],audit:[],preferences:{company:'AUREL'}};
 const response=stateResponse({user:viewer},db,x=>x);
 assert.deepEqual(response.clients,[]);
 assert.deepEqual(response.payments,[]);
 assert.equal(response.units[0].rent,null);
 assert.equal(response.units[0].ownerId,'');
});
