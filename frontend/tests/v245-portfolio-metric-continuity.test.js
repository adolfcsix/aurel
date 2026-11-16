import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterPortfolioUnits,portfolioHierarchy} from '../src/lib/portfolio-hierarchy.js';
import {getPortfolioOverview} from '../src/lib/overview.js';

const fixture=()=>({
 projects:[{id:7,name:'Tòa Sen'},{id:'07',name:'Dự án riêng'},{id:8,name:'Dự án lưu trữ',status:'archived'}],
 units:[
  {id:'101',projectId:'7',managerId:14,status:'occupied',code:'A-101',owner:'Nguyễn An',tenant:'Lê Bình',address:'Hải Phòng'},
  {id:102,projectId:7,managerId:'14',status:'vacant',code:'A-102',address:'Hà Nội'},
  {id:'103',projectId:'07',managerId:'14',status:'draft',code:'B-103'},
  {id:'104',projectId:8,status:'occupied',code:'C-104'},
  {id:'105',projectId:null,status:'draft',code:'Căn chưa gán'}
 ],leases:[],schedules:[],payments:[],depositTransactions:[]
});

test('V2.45 dashboard and hierarchy match numeric/string IDs but not leading-zero aliases',()=>{
 const db=fixture();const before=structuredClone(db);
 const view=getPortfolioOverview(db,'2026-11','2026-11-12');const hierarchy=portfolioHierarchy(db);
 assert.equal(view.units,5);
 assert.deepEqual(view.projectIndex.map(p=>[p.id,p.count]),[[7,2],['07',1]]);
 assert.deepEqual(view.projectIndex.map(p=>p.count),view.projectIndex.map(p=>hierarchy.project(p.id).units.length));
 assert.equal(view.projectIndex[0].fillRate,50);
 assert.deepEqual(db,before,'projection must remain read only');
});

test('V2.45 project and staff filters share persisted-ID rules with client dossiers',()=>{
 const db=fixture();
 assert.deepEqual(filterPortfolioUnits(db,{projectId:'7'}).map(u=>u.id),['101',102]);
 assert.deepEqual(filterPortfolioUnits(db,{projectId:'07'}).map(u=>u.id),['103']);
 assert.deepEqual(filterPortfolioUnits(db,{staffId:'14'}).map(u=>u.id),['101',102,'103']);
 assert.deepEqual(filterPortfolioUnits(db,{projectId:'',staffId:''}).map(u=>u.id),['101',102,'103','104','105']);
 assert.deepEqual(filterPortfolioUnits(db,{projectId:null}).map(u=>u.id),['101',102,'103','104','105']);
});

test('V2.45 search never indexes owner/tenant display names when permission is absent',()=>{
 const db=fixture();
 assert.deepEqual(filterPortfolioUnits(db,{search:'Nguyễn An',includeNames:false}),[]);
 assert.deepEqual(filterPortfolioUnits(db,{search:'Lê Bình',includeNames:false}),[]);
 assert.deepEqual(filterPortfolioUnits(db,{search:'Nguyễn An',includeNames:true}).map(u=>u.id),['101']);
 assert.deepEqual(filterPortfolioUnits(db,{search:'Tòa Sen'}).map(u=>u.id),['101',102]);
 assert.deepEqual(filterPortfolioUnits(db,{search:'HẢI PHÒNG'}).map(u=>u.id),['101']);
});

test('V2.45 client-side review filtering remains additive and defaults to no restriction',()=>{
 const db=fixture();
 assert.deepEqual(filterPortfolioUnits(db,{projectId:7,reviewOnly:true},u=>u.status==='vacant').map(u=>u.id),[102]);
 assert.deepEqual(filterPortfolioUnits(db,{projectId:7,reviewOnly:false},()=>false).map(u=>u.id),['101',102]);
});

test('V2.45 dashboard progress accessibility cannot exceed 100% even with excess receipts',()=>{
 const db={projects:[],units:[],leases:[],depositTransactions:[],schedules:[{id:'s1',status:'open',period:'2026-11',amount:100,dueOn:'2026-11-20'}],payments:[{id:'p1',scheduleId:'s1',status:'posted',amount:150}]};
 const view=getPortfolioOverview(db,'2026-11','2026-11-12');
 assert.equal(view.totals.paid,150,'receipts must not be reduced');
 assert.equal(view.totals.due,100,'due must not be changed');
 assert.equal(view.collectionRate,100,'visual progressbar upper bound');
});

test('V2.45 read-only React views use canonical lookup across desktop/mobile',()=>{
 const src=relative=>readFileSync(new URL('../src/'+relative,import.meta.url),'utf8');
 const app=src('App.jsx'),mobile=src('components/MobileRecords.jsx'),overview=src('components/ExecutiveOverview.jsx');
 assert.match(app,/filterPortfolioUnits\(data,\{projectId:projectFilter,staffId:staffFilter,reviewOnly,search,includeNames:canSeePortfolioFinancials\},needsReview\)/);
 assert.match(app,/\[data,projectFilter,staffFilter,reviewOnly,search,canSeePortfolioFinancials,favoritesOnly,auth\?\.favoriteUnitIds\]/);
 assert.match(app,/const getUnit=id=>findDossierRow\(data\.units,id\)/);
 assert.match(mobile,/findDossierRow\(projects,id\)/);
 assert.match(mobile,/findDossierRow\(staff,id\)/);
 assert.match(overview,/const unit=id=>findDossierRow\(data\.units,id\)/);
});

test('V2.45 mobile lease cards do not reveal tenant names to restricted roles',()=>{
 const mobile=readFileSync(new URL('../src/components/MobileRecords.jsx',import.meta.url),'utf8');
 assert.match(mobile,/subtitle=\{showFinancial\?\(l\.tenantName\|\|'Chưa có người thuê'\):'Thông tin khách thuê được giới hạn'\}/);
 assert.doesNotMatch(mobile,/subtitle=\{l\.tenantName\|\|'Chưa có người thuê'\}/);
});

test('V2.45 private client dossier links need an explicit client permission',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const dossier=readFileSync(new URL('../src/components/PropertyDossier.jsx',import.meta.url),'utf8');
 assert.match(app,/if\(kind==='client'&&\!\(can\('client\.read'\)\|\|can\('client\.write'\)\)\)return/);
 assert.match(app,/dossier\?\.kind==='client'&&\(can\('client\.read'\)\|\|can\('client\.write'\)\)/);
 assert.match(dossier,/const canOpenClient=can\('client\.read'\)\|\|can\('client\.write'\)/);
 assert.match(dossier,/showFinancial&&canOpenClient&&\(unit\.ownerId\|\|unit\.tenantId\)/);
});
