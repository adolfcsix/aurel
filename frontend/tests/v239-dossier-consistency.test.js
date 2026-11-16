import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sameDossierId,findDossierRow,dedupeDossierRows} from '../src/lib/dossier-id.js';
import {clientUnitLinks,possibleClientLeases,projectDossierLinks,staffDossierLinks,leaseDossierLinks} from '../src/lib/dossier-relations.js';
import {clientProfileView,unitRelationLabel} from '../src/lib/client-profile.js';
import {projectEssentials,leaseEssentials,staffEssentials} from '../src/lib/dossier-essentials.js';
const jsx=name=>readFileSync(new URL('../src/components/'+name+'.jsx',import.meta.url),'utf8');
const data={
 clients:[{id:501,name:'Chủ sở hữu'}],
 projects:[{id:12,name:'Maison Garden'}],
 buildings:[{id:34,projectId:'12',name:'Tòa B'}],
 staff:[{id:61,name:'Quản lý'}],
 units:[{id:101,code:'B-01',ownerId:'501',tenantId:null,projectId:'12',buildingId:34,managerId:'61',saleId:null,status:'occupied'},
        {id:'102',code:'B-02',ownerId:501,tenantId:501,projectId:12,buildingId:'34',saleId:61},
        {id:'103',code:'X',ownerId:null,tenantId:'',projectId:'',buildingId:null}],
 leases:[{id:71,unitId:'101',status:'active',tenantName:'Khách A'},
         {id:'72',unitId:102,status:'draft',tenantName:'Khách B'},
         {id:'73',unitId:null,status:'active'}],
 schedules:[{id:8,leaseId:'71',status:'open',amount:5000}],depositTransactions:[],depositSettlements:[]
};
test('v239 canonical keys match imported numeric/string identifiers but never empty values',()=>{
 assert.equal(sameDossierId(' 101 ',101),true);
 for(const v of [null,undefined,'','  '])assert.equal(sameDossierId(v,v),false);
 assert.equal(sameDossierId('001',1),false);
 assert.equal(sameDossierId('a', 'A'),false);
 assert.equal(findDossierRow(data.projects,'12')?.name,'Maison Garden');
 assert.equal(findDossierRow(data.units,''),null);
 assert.equal(findDossierRow(data.units,null),null);
 assert.equal(findDossierRow([],101),null);
});
test('v239 client related units are stable, deduplicated, and do not join by name',()=>{
 const links=clientUnitLinks(data,'501');
 assert.deepEqual(links.owned.map(x=>x.id),[101,'102']);
 assert.deepEqual(links.rented.map(x=>x.id),['102']);
 assert.deepEqual(links.all.map(x=>x.id),[101,'102']);
 assert.equal(unitRelationLabel(data.units[1],links),'Sở hữu · Đang thuê');
 assert.equal(clientProfileView(data,data.clients[0]).projectCount,1);
 assert.deepEqual(possibleClientLeases(data,501).map(x=>x.id),[71,'72']);
 assert.equal(clientUnitLinks(data,null).all.length,0);
 assert.deepEqual(dedupeDossierRows([{id:'1'},{id:1},{id:''},{id:'2'}]).map(x=>x.id),['1','2']);
});
test('v239 project, staff and lease views reference the same two linked units',()=>{
 assert.deepEqual(projectDossierLinks(data,'12').units.map(x=>x.id),[101,'102']);
 assert.equal(projectEssentials(data,data.projects[0]).perBuilding[0].units.length,2);
 assert.deepEqual(staffDossierLinks(data,'61').managed.map(x=>x.id),[101]);
 assert.equal(staffEssentials(data,data.staff[0]).unique.length,2);
 assert.equal(leaseDossierLinks(data,'71').unit.id,101);
 assert.equal(leaseDossierLinks(data,'71').schedules.length,1);
 assert.equal(leaseEssentials(data,data.leases[0]).building.name,'Tòa B');
});
test('v239 all four dossiers share stat and row presentation without extra CSS',()=>{
 for(const name of ['ClientDossier','ProjectDossier','StaffDossier','LeaseDossier']){
  const source=jsx(name);
  assert.match(source,/<DossierStat /,name);
  assert.match(source,/DossierFrame/,name);
  assert.match(source,/DossierDetail/,name);
  assert.doesNotMatch(source,/Thử phím|Nhấn Tab|Cách thử/);
 }
 for(const name of ['ClientDossier','ProjectDossier','StaffDossier'])assert.match(jsx(name),/<DossierRecord /);
 const frame=jsx('DossierFrame');
 assert.match(frame,/aurel-dossier-record-end/);
 assert.match(frame,/is-empty/);
 assert.match(frame,/empty\?'Chưa cập nhật'/);
});
test('v239 record navigation obeys permissions and never asserts contract signer identity',()=>{
 const client=jsx('ClientDossier'),project=jsx('ProjectDossier'),staff=jsx('StaffDossier'),lease=jsx('LeaseDossier');
 for(const source of [client,project,staff])assert.match(source,/can\('unit.read'\)\|\|can\('unit.write'\)/);
 assert.match(client,/can\('lease.read'\)\|\|can\('lease.write'\)/);
 assert.match(client,/Hợp đồng tại căn liên quan/);
 assert.match(lease,/tenantIdentityVerified/);
 assert.match(lease,/showFinancial&&/);
 assert.match(project,/findDossierRow/);
 assert.match(staff,/findDossierRow/);
});

test('v239 dossier titleplate names its actual business entity',()=>{
 const expected={ClientDossier:'HỒ SƠ KHÁCH HÀNG',StaffDossier:'HỒ SƠ NHÂN SỰ',ProjectDossier:'HỒ SƠ DỰ ÁN',LeaseDossier:'HỒ SƠ HỢP ĐỒNG'};
 for(const [component,label] of Object.entries(expected))assert.ok(jsx(component).includes('signature="'+label+'"'),component);
 assert.ok(jsx('DossierFrame').includes('{signature}'));
});
