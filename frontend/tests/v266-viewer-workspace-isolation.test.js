import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canNavigate,buildQuickFindIndex} from '../src/lib/quick-find.js';
import {visibleNavigationGroups} from '../src/lib/navigation-shell.js';
import {allowed} from '../src/lib/finance.js';
import {hasPermission} from '../../backend/src/security.js';
import {stateResponse} from '../../backend/src/state-access.js';

const source=file=>readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
const viewer={id:'viewer-1',role:'viewer'};
const excluded=['leases','payments','fees','deposits','reminders','clients','staff','reports','quality','audit','archives','imports','settings'];

test('V2.66 viewer sees only browsing and personal pages, never operational tools',()=>{
 for(const section of ['dashboard','units','projects','profile'])assert.equal(canNavigate(viewer,section),true,section);
 for(const section of excluded)assert.equal(canNavigate(viewer,section),false,section);
 const groups=[{name:'Danh mục',items:[['dashboard','Tổng quan'],['units','Danh mục căn hộ'],['payments','Khoản thu & công nợ']]},{name:'Quản trị',items:[['settings','Cài đặt & phân quyền'],['deposits','Hoàn cọc'],['staff','Phân công nhân viên']]}];
 assert.deepEqual(visibleNavigationGroups(groups,viewer,canNavigate).map(g=>g.items.map(i=>i[0])),[['dashboard','units']]);
});

test('V2.66 viewer private search omits leases and management destinations',()=>{
 const sample={projects:[{id:1,name:'Dự án Mây'}],units:[{id:2,projectId:1,code:'A-11'}],leases:[{id:3,unitId:2,endsOn:'2028-01-05',tenantName:'PRIVATE TENANT'}],clients:[]};
 const index=buildQuickFindIndex(sample,viewer,[{id:'payments',label:'Thanh toán'},{id:'settings',label:'Phân quyền'},{id:'units',label:'Căn hộ'}]);
 assert.deepEqual(index.filter(x=>x.kind==='section').map(x=>x.target),['units']);
 assert.equal(index.some(x=>x.kind==='lease'),false);
 assert.equal(index.some(x=>x.searchText?.includes('PRIVATE TENANT')),false);
});

test('V2.66 normal viewer cannot mutate money, manage others or grant a role via frontend or backend',()=>{
 for(const capability of ['unit.write','lease.write','payment.write','deposit.write','deposit.approve','deposit.execute','staff.write','settings.write','client.write']){
  assert.equal(allowed(viewer,capability),false,capability);
  assert.equal(hasPermission(viewer,capability),false,capability);
 }
 assert.equal(canNavigate({role:'admin'},'settings'),true);
 assert.equal(canNavigate({role:'manager'},'settings'),true); // Manager may edit policy, not grant roles
 assert.equal(canNavigate({role:'accountant'},'payments'),true);
});

test('V2.66 account menu sends viewer to personal profile and admin to governance',()=>{
 const app=source('App.jsx');
 assert.match(app,/setPage\(auth\.role==='admin'\?'settings':'profile'\)/);
 assert.match(app,/page==='settings'&&canNavigate\(auth,'settings'\)&&settingsPage\(\)/);
 assert.match(app,/page==='profile'&&profilePage\(\)/);
 assert.match(app,/name:'Cá nhân',items:\[\['profile','Hồ sơ cá nhân','user'\]/);
 assert.match(app,/api\('\/auth\/profile'/);
});

test('V2.66 homepage swaps management task board for saved apartments in viewer mode',()=>{
 const home=source('components/ExecutiveOverview.jsx');
 assert.match(home,/viewerMode\?<section className="atelier-priority"/);
 assert.match(home,/CĂN QUAN TÂM/);
 assert.match(home,/Xem căn đã lưu/);
 assert.match(source('App.jsx'),/viewerMode=\{auth\.role==='viewer'\}/);
});

test('V2.66 mobile card and detail do not render financial placeholders and operational tabs for viewer',()=>{
 const mobile=source('components/MobileRecords.jsx');
 const detail=source('components/PropertyDossier.jsx');
 assert.match(mobile,/\{showFinancial&&<div className="aurel-record-price"/);
 assert.match(mobile,/\{\(showFinancial\|\|showStaff\)&&<div className="aurel-record-meta-grid"/);
 assert.match(detail,/viewerMode\?key==='overview'/);
 assert.match(detail,/\{!viewerMode&&<><ProfilePair label="Người phụ trách"/);
 assert.match(source('App.jsx'),/viewerMode=\{auth\.role==='viewer'\}/);
});

test('V2.66 API state still strips financial records from viewer regardless of hidden UI',()=>{
 const db={projects:[],buildings:[],floors:[],rooms:[],staff:[],clients:[],units:[],leases:[],schedules:[],payments:[{id:'secret',amount:5000}],paymentAttachments:[],depositTransactions:[],depositSettlements:[],feeHistory:[],reminderContacts:[],reminderNotifications:[],users:[],sessions:[],audit:[],preferences:{company:'AUREL'}};
 const response=stateResponse({user:viewer},db,x=>x);
 for(const key of ['payments','depositTransactions','depositSettlements','clients','users'])assert.deepEqual(response[key],[],key);
});
