import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectEssentials,staffEssentials,leaseEssentials,dossierAccess} from '../src/lib/dossier-essentials.js';

const file=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8');
const sample={
 projects:[{id:'p1',name:'The Grove',city:'Hà Nội',buildings:['A','B']},{id:'p2',name:'Maison 2'}],
 buildings:[{id:'b1',projectId:'p1',code:'A',name:'Tòa A'}],
 floors:[{id:'f1',buildingId:'b1'},{id:'f2',buildingId:'unmatched'}],
 rooms:[{id:'r1',floorId:'f1'},{id:'r2',floorId:'f2'}],
 units:[
  {id:'u1',code:'A-01',projectId:'p1',buildingId:'b1',managerId:'s1',saleId:'s1',status:'occupied'},
  {id:'u2',code:'B-02',projectId:'p1',building:'B',managerId:'s1',saleId:'s2'},
  {id:'u3',code:'C-03',projectId:'p1',buildingId:'b-missing',saleId:'s1'},
  {id:'u4',code:'X-01',projectId:'p2',managerId:'s2'}
 ],
 staff:[{id:'s1',name:'A',role:'Quản lý'},{id:'s2',name:'B'}],
 leases:[{id:'l1',unitId:'u1',status:'active',tenantName:'A',notes:'Ghi chú',startsOn:'2026-11-01'},
         {id:'l2',unitId:'u2',status:'draft',tenantName:'B'},{id:'l3',unitId:'u4',status:'active'}],
 schedules:[{id:'sc1',leaseId:'l1',status:'open',amount:200},{id:'sc2',leaseId:'l1',status:'archived',amount:100}],
 depositTransactions:[],depositSettlements:[]
};

test('v238 project summary counts only confirmed project and building IDs',()=>{
 const s=projectEssentials(sample,sample.projects[0]);
 assert.deepEqual(s.buildings.map(x=>x.id),['b1']);
 assert.deepEqual(s.units.map(x=>x.id),['u1','u2','u3']);
 assert.equal(s.activeLeaseCount,1);
 assert.equal(s.perBuilding[0].units.length,1);
 assert.deepEqual(s.withoutBuilding.map(u=>u.id),['u2']);
 assert.deepEqual(s.unresolved.map(u=>u.id),['u3']);
 assert.deepEqual(s.legacyBuildingCodes,['B']);
});
test('v238 project summary relates floors and rooms using IDs, not same-looking names',()=>{
 const s=projectEssentials(sample,sample.projects[0]);
 assert.deepEqual(s.linkedFloors.map(x=>x.id),['f1']);
 assert.deepEqual(s.linkedRooms.map(x=>x.id),['r1']);
 assert.equal(projectEssentials(sample,{id:'missing'}),null);
});
test('v238 staff counts overlapping manager and sales once for unique properties',()=>{
 const s=staffEssentials(sample,sample.staff[0]);
 assert.equal(s.managed.length,2);assert.equal(s.sales.length,2);
 assert.deepEqual(s.unique.map(u=>u.id),['u1','u2','u3']);
 assert.equal(s.projectCount,1);
 assert.deepEqual(s.responsibility(sample.units[0]),['Quản lý','Kinh doanh']);
 assert.deepEqual(s.responsibility(sample.units[1]),['Quản lý']);
 assert.equal(staffEssentials(sample,{id:'missing'}),null);
});
test('v238 lease location uses explicit property IDs, never guessed tenant relation',()=>{
 const s=leaseEssentials(sample,sample.leases[0]);
 assert.equal(s.unit.id,'u1');assert.equal(s.project.id,'p1');assert.equal(s.building.id,'b1');
 assert.match(s.location,/The Grove/);
 assert.equal(s.hasNotes,true);
 assert.equal(s.tenantIdentityVerified,false);
 assert.equal(leaseEssentials(sample,{id:'missing'}),null);
});
test('v238 absent optional sections do not appear as fake requirements',()=>{
 const project=file('components/ProjectDossier.jsx'),staff=file('components/StaffDossier.jsx');
 assert.match(project,/project.short&&/);
 assert.match(staff,/Boolean\(staff.notes\?\.trim\(\)\)/);
 assert.match(staff,/showContact&&/);
 for(const src of [project,staff])assert.doesNotMatch(src,/fetch\(|axios\(|localStorage/);
});
test('v238 financial access model separates restricted and full presentation',()=>{
 assert.deepEqual(dossierAccess(false),{financial:false,clientNames:false,rentSchedules:false,paymentDetails:false});
 assert.deepEqual(dossierAccess(true),{financial:true,clientNames:true,rentSchedules:true,paymentDetails:true});
 const property=file('components/PropertyDossier.jsx');
 assert.match(property,/access\.rentSchedules&&<div className="v09-dossier-table"/);
 assert.match(property,/access\.clientNames&&/);
 assert.match(property,/showFinancial&&unit.notes&&/);
 const lease=file('components/LeaseDossier.jsx');
 assert.match(lease,/sections=\{showFinancial\?/);
 assert.match(lease,/showFinancial&&<DossierDetail label="Người thuê ghi trên hợp đồng"/);
 assert.match(lease,/showFinancial&&<DossierStat label="Còn thu theo kỳ mở"/);
});
test('v238 no redundant journey module on the unit dossier, core attributes preserved',()=>{
 const property=file('components/PropertyDossier.jsx');
 assert.doesNotMatch(property,/<EstateJourney/);
 for(const x of ['unit.area','unit.bedrooms','unit.interiorStatus','unit.ownerId','unit.tenantId','unit.managerId','unit.saleId'])assert.ok(property.includes(x),x);
 for(const f of ['ProjectDossier','StaffDossier','LeaseDossier','PropertyDossier']){
  assert.doesNotMatch(file('components/'+f+'.jsx'),/Thử phím|Nhấn Tab|Cách thử|Mở thử/);
 }
});
test('v238 view model remains read-only, with no invented backend associations',()=>{
 const core=file('lib/dossier-essentials.js');
 assert.doesNotMatch(core,/fetch\(|axios\(|sessionStorage|localStorage|\.tenantName\s*===/);
 assert.match(core,/tenantIdentityVerified:Boolean\(findDossierRow/);
});

import {exportUnitCatalogCSV} from '../src/lib/unit-export.js';
test('v238 CSV export is a real function with no invented or serialized private fields',()=>{
 const sampleUnits=[{id:'secret-1',code:'A-01',projectId:'p1',building:'A',floor:'12',room:'08',area:78,bedrooms:2,status:'occupied',owner:'Nguyễn Minh Anh',tenant:'Lê Hoàng An',rent:12500000,feePercent:6,notes:'Private notes',csrf:'private-token'}];
 const limited=exportUnitCatalogCSV(sampleUnits,[{id:'p1',name:'Grove'}]);
 assert.ok(limited.startsWith('\uFEFF'));
 for(const hidden of ['Nguyễn Minh Anh','Lê Hoàng An','12500000','Private notes','csrf','private-token','secret-1'])assert.ok(!limited.includes(hidden),hidden);
 assert.match(limited,/Grove/);assert.match(limited,/A-01/);
 const granted=exportUnitCatalogCSV(sampleUnits,[{id:'p1',name:'Grove'}],{includePrivate:true});
 assert.match(granted,/Nguyễn Minh Anh/);assert.match(granted,/12500000/);
 assert.doesNotMatch(granted,/Private notes|csrf|private-token|secret-1/);
});
test('v238 CSV values cannot trigger Excel formula evaluation',()=>{
 const rows=[{id:'1',code:'=HYPERLINK("http://invalid")',building:'+SUM(1,1)',projectId:'p1',status:'@cmd'},{id:'2',code:'ordinary',building:'-1+2'}];
 const csv=exportUnitCatalogCSV(rows,[{id:'p1',name:'Project'}]);
 assert.match(csv,/"'=HYPERLINK\(""http:\/\/invalid""\)"/);
 assert.match(csv,/"'\+SUM\(1,1\)"/);assert.match(csv,/"'@cmd"/);assert.match(csv,/"'-1\+2"/);
 assert.match(csv,/"ordinary"/);
});
test('v238 catalog export and financial masking follow actual business permissions',()=>{
 const app=file('App.jsx');
 assert.match(app,/const downloadCSV=\(\)=>/);
 assert.match(app,/const canExportUnitCatalog=can\('unit.write'\)\|\|can\('report.read'\)/);
 assert.match(app,/canExportUnitCatalog&&<Btn icon="download" onClick=\{downloadCSV\}/);
 assert.match(app,/includePrivate:canSeePortfolioFinancials/);
 assert.match(app,/showFinancial=\{canSeePortfolioFinancials\}/);
 assert.match(app,/!canSeePortfolioFinancials\?'Giới hạn quyền xem'/);
});
