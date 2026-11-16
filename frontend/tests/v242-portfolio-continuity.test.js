import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {portfolioHierarchy,projectOccupancy} from '../src/lib/portfolio-hierarchy.js';
import {projectDossierLinks} from '../src/lib/dossier-relations.js';

const source=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const fixture={
 projects:[{id:7,name:'A'},{id:'09',name:'B'}],
 buildings:[{id:'3',projectId:'7',name:'Tòa A'},{id:5,projectId:9,name:'Không có dự án'},{id:'z',projectId:'',name:'Chưa gán'}],
 floors:[{id:10,buildingId:3},{id:'11',buildingId:5},{id:'12',buildingId:'missing'}],
 rooms:[{id:'R1',floorId:'10'},{id:'R2',floorId:11},{id:'R3',floorId:'12'}],
 units:[{id:100,projectId:'7',status:'occupied'},{id:'101',projectId:7,status:'draft'},{id:102,projectId:'09',status:'vacant'},{id:103,projectId:9,status:'occupied'},{id:104,projectId:null,status:'draft'}],
 leases:[{id:'L1',unitId:'100',status:'active'},{id:'L2',unitId:101,status:'active'},{id:'L3',unitId:102,status:'active'},{id:'L4',unitId:null,status:'draft'}]
};

test('v242 project index and spatial tree count identical ID-verified units',()=>{
 const graph=portfolioHierarchy(fixture);
 const a=graph.project('7'),b=graph.project('09');
 assert.deepEqual(a.units.map(x=>x.id),[100,'101']);
 assert.deepEqual(b.units.map(x=>x.id),[102]);
 assert.deepEqual([a.buildings.length,a.floors.length,a.rooms.length,a.units.length],[1,1,1,2]);
 assert.deepEqual([b.buildings.length,b.floors.length,b.rooms.length,b.units.length],[0,0,0,1]);
 assert.deepEqual(a.units,graph.unitsFor(7));
});
test('v242 floor/room are counted through persisted parent IDs, not denormalized projectId',()=>{
 const view=portfolioHierarchy(fixture).project(7);
 assert.equal(view.floors[0].id,10);
 assert.equal(view.rooms[0].id,'R1');
 assert.equal(view.floors[0].projectId,undefined);
});
test('v242 missing/invalid parent links remain visible as unassigned, never name-matched',()=>{
 const graph=portfolioHierarchy(fixture);
 assert.deepEqual(graph.unassigned.buildings.map(x=>x.id),[5,'z']);
 assert.deepEqual(graph.unassigned.floors.map(x=>x.id),['11','12']);
 assert.deepEqual(graph.unassigned.rooms.map(x=>x.id),['R2','R3']);
 assert.equal(graph.project('09').rooms.length,0);
 assert.equal(graph.project(null).units.length,0);
});
test('v242 ID canonicalization preserves leading-zero distinctions and does not guess identities',()=>{
 const graph=portfolioHierarchy(fixture);
 assert.deepEqual(graph.project(9).units.map(x=>x.id),[103]);
 assert.deepEqual(graph.project('09').units.map(x=>x.id),[102]);
 assert.equal(graph.project('invalid').buildings.length,0);
 assert.equal(graph.project('').units.length,0);
});
test('v242 project and lease dossier count typed unit IDs consistently',()=>{
 const a=projectDossierLinks(fixture,7);
 assert.equal(a.units.length,2);
 assert.deepEqual(a.leases.map(x=>x.id),['L1','L2']);
 assert.deepEqual(projectDossierLinks(fixture,'09').leases.map(x=>x.id),['L3']);
 assert.equal(projectDossierLinks(fixture,'no project'),null);
});
test('v242 occupancy is exact and empty data has no invented rate',()=>{
 assert.deepEqual(projectOccupancy([]),{units:0,occupied:0,drafts:0,percent:0});
 assert.deepEqual(projectOccupancy(fixture.units),{units:5,occupied:2,drafts:2,percent:40});
 assert.deepEqual(portfolioHierarchy(null).project(7).units,[]);
});
test('v242 spatial catalog and index use one shared hierarchical source',()=>{
 const index=source('components/PortfolioIndex.jsx'),spatial=source('components/SpatialCatalog.jsx');
 assert.match(index,/portfolioHierarchy\(/);
 assert.match(spatial,/portfolioHierarchy\(/);
 assert.match(spatial,/hierarchy\.buildingsFor/);
 assert.match(index,/sameDossierId\(projectFilter,project\.id\)/);
 assert.doesNotMatch(index,/PROJECT INDEX|CHỌN DỰ ÁN ĐỂ LỌC|Chọn một dự án để đi sâu/);
 assert.doesNotMatch(spatial,/Có thể tạo căn hộ trước và bổ sung tầng\/phòng sau/);
});
test('v242 finance actions have differentiated intent, never decorative Pearl',()=>{
 const workbench=source('components/ApprovalWorkbench.jsx');
 assert.match(workbench,/kind="dangerGhost" onClick=\{\(\)=>onReject\(item\)\}/);
 assert.match(workbench,/kind="primary" onClick=\{\(\)=>onApprove\(item\)\}/);
 assert.doesNotMatch(workbench,/<Btn[^>]*finish="pearl"[^>]*on(?:Approve|Reject|Execute)/);
 assert.doesNotMatch(workbench,/Thử mã căn hộ/);
});
test('v242 quality issue opens its actual section, not a falsely claimed dossier',()=>{
 const center=source('components/DataQualityCenter.jsx');
 assert.match(center,/>Xem phân hệ <Icon/);
 assert.doesNotMatch(center,/>Mở hồ sơ <Icon/);
});
test('v242 icon actions maintain 44px target and consistent 14px silhouette',()=>{
 const css=source('atelier-v233.css');
 assert.match(css,/\.spatial-catalog \.spatial-actions \.aurel-icon-action\{[\s\S]*?min-width:44px;min-height:44px/);
 assert.match(css,/border-radius:var\(--aurel-action-radius,14px\)/);
 assert.doesNotMatch(source('main.jsx'),/atelier-v242\.css/);
});
