import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clientUnitLinks,possibleClientLeases,leaseDossierLinks,projectDossierLinks,staffDossierLinks,contactDisplayType} from '../src/lib/dossier-relations.js';
const data={
 projects:[{id:'p1',name:'The Grove'},{id:'p2',name:'The River'}],buildings:[{id:'b1',projectId:'p1'},{id:'b2',projectId:'p2'}],
 clients:[{id:'c1',name:'An',type:'both'},{id:'c2',name:'An',type:'owner'}],
 units:[{id:'u1',code:'A01',projectId:'p1',ownerId:'c1',tenantId:'c1',managerId:'s1',saleId:'s1'}, {id:'u2',code:'A02',projectId:'p1',ownerId:'c2',tenantId:'c1',managerId:'s1'}, {id:'u3',code:'R01',projectId:'p2',ownerId:'c2',managerId:'s2'}],
 leases:[{id:'l1',unitId:'u1',tenantName:'An',status:'active'}, {id:'l2',unitId:'u2',tenantName:'An',status:'ended'},{id:'l3',unitId:'u3',tenantName:'An',status:'draft'}],
 schedules:[{id:'d1',leaseId:'l1',status:'open'},{id:'d2',leaseId:'l1',status:'historical'},{id:'d3',leaseId:'l2',status:'open'}],
 depositTransactions:[{id:'t1',leaseId:'l1'}],depositSettlements:[{id:'pr1',leaseId:'l1'}],staff:[{id:'s1',name:'Hà'},{id:'s2',name:'Nam'}]
};
const read=file=>readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
test('contact matching uses ownerId and tenantId only, deduplicating both roles',()=>{
 const result=clientUnitLinks(data,'c1');
 assert.deepEqual(result.owned.map(u=>u.id),['u1']);
 assert.deepEqual(result.rented.map(u=>u.id),['u1','u2']);
 assert.deepEqual(result.all.map(u=>u.id),['u1','u2']);
 assert.deepEqual(clientUnitLinks(data,'not-a-real-id').all,[]);
});
test('leases on linked units are only candidates, not a client identity assertion',()=>{
 assert.deepEqual(possibleClientLeases(data,'c1').map(l=>l.id),['l1','l2']);
 assert.deepEqual(possibleClientLeases(data,'c2').map(l=>l.id),['l2','l3']);
 assert.equal(read('components/ClientDossier.jsx').includes('chưa xác nhận người thuê bằng mã hồ sơ'),true);
});
test('lease details join by lease ID; historical schedules do not enter current ledger',()=>{
 const record=leaseDossierLinks(data,'l1');assert.equal(record.unit.id,'u1');
 assert.deepEqual(record.schedules.map(s=>s.id),['d1']);
 assert.deepEqual(record.transactions.map(t=>t.id),['t1']);
 assert.deepEqual(record.proposals.map(t=>t.id),['pr1']);
 assert.equal(leaseDossierLinks(data,'not-found'),null);
});
test('project details are isolated by project ID; staff assignments are separated by role',()=>{
 assert.deepEqual(projectDossierLinks(data,'p1').units.map(u=>u.id),['u1','u2']);
 assert.deepEqual(projectDossierLinks(data,'p1').leases.map(l=>l.id),['l1','l2']);
 assert.deepEqual(staffDossierLinks(data,'s1').managed.map(u=>u.id),['u1','u2']);
 assert.deepEqual(staffDossierLinks(data,'s1').sales.map(u=>u.id),['u1']);
 assert.equal(staffDossierLinks(data,'missing'),null);
});
test('record modules are integrated into real App, mobile, spatial catalog and property details',()=>{
 const app=read('App.jsx');
 for(const part of ['ClientDossier','LeaseDossier','ProjectDossier','StaffDossier','onOpenClient={id=>','onOpenLease={id=>',"viewDossier('client',c.id)","viewDossier('lease',l.id)","viewDossier('staff',s.id)","viewDossier('project',id)"]){assert.ok(app.includes(part),part)}
 assert.match(read('components/MobileRecords.jsx'),/Xem hồ sơ hợp đồng/);
 assert.match(read('components/SpatialCatalog.jsx'),/Xem hồ sơ dự án/);
 assert.match(read('main.jsx'),/import '\.\/atelier-v226\.css';/);
});
test('privacy and dangerous writes remain outside read-only dossier selectors',()=>{
 const helper=read('lib/dossier-relations.js');assert.doesNotMatch(helper,/\bfetch\s*\(|\bapi\s*\(|localStorage|name\s*===\s*tenantName/);
 const lease=read('components/LeaseDossier.jsx');assert.match(lease,/showFinancial&&/);assert.match(lease,/can\('lease.write'\)/);
 const staff=read('components/StaffDossier.jsx');assert.match(staff,/showContact&&/);
 const css=read('atelier-v226.css');assert.match(css,/max-width:700px/);assert.match(css,/prefers-reduced-motion/);assert.match(css,/border-radius:14px/);
});
test('contact labels do not mix distinct legal relationships',()=>{
 assert.equal(contactDisplayType('owner'),'Chủ sở hữu');assert.equal(contactDisplayType('tenant'),'Khách thuê');assert.equal(contactDisplayType('both'),'Chủ sở hữu và khách thuê');
});
