import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clientProfileView,clientContactLink,unitRelationLabel} from '../src/lib/client-profile.js';
const source=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const client={id:'c1',name:'Nguyễn Minh Anh',type:'owner',code:'CSH-024',phone:'090 356 8240',email:'minhanh@example.com',address:'Hà Nội',notes:''};
const data={units:[{id:'u1',ownerId:'c1',tenantId:'c2',projectId:'p1'},{id:'u2',ownerId:'c1',projectId:'p2'},{id:'u3',ownerId:'c2',tenantId:'c1',projectId:'p2'}],leases:[{id:'l1',unitId:'u1',tenantName:'Nguyễn Minh Anh',status:'active'},{id:'l2',unitId:'u2',tenantName:'B',status:'draft'},{id:'l3',unitId:'u3',tenantName:'C',status:'archived'}]};
test('v237 derives factual counts and unique projects from client IDs',()=>{
 const m=clientProfileView(data,client);
 assert.deepEqual(m.linked.owned.map(u=>u.id),['u1','u2']);
 assert.deepEqual(m.linked.rented.map(u=>u.id),['u3']);
 assert.equal(m.projectCount,2);
 assert.equal(m.linked.all.length,3);
 assert.equal(m.possible.length,2);
 assert.deepEqual(m.sections.map(x=>x.key),['contact','properties','matching']);
});
test('v237 does not imply verified lease identity or include archived contract',()=>{
 const m=clientProfileView(data,client);
 assert.ok(m.possible.some(l=>l.id==='l1'));
 assert.ok(!m.possible.some(l=>l.id==='l3'));
 assert.match(source('components/ClientDossier.jsx'),/chưa xác nhận người thuê bằng mã hồ sơ/);
 assert.match(source('components/ClientDossier.jsx'),/Hợp đồng tại căn liên quan/);
});
test('v237 can describe both owner and tenant without duplicating a unit',()=>{
 const overlap={...data,units:[{id:'u1',ownerId:'c1',tenantId:'c1',projectId:'p1'}]};
 const m=clientProfileView(overlap,client);
 assert.equal(m.linked.all.length,1);
 assert.equal(unitRelationLabel(overlap.units[0],m.linked),'Sở hữu · Đang thuê');
});
test('v237 contact links are safe and optional',()=>{
 assert.equal(clientContactLink('phone','090 356 8240'),'tel:0903568240');
 assert.equal(clientContactLink('email','minhanh@example.com'),'mailto:minhanh@example.com');
 for(const x of ['javascript:alert(1)','1;DROP','+12',''])assert.equal(clientContactLink('phone',x),null);
 assert.equal(clientContactLink('email','javascript:alert(1)'),null);
 assert.equal(clientContactLink('url','https://example.com'),null);
});
test('v237 missing data stays visibly missing, notes are conditional',()=>{
 const m=clientProfileView({units:[],leases:[]},{id:'x',phone:'',email:'',notes:''});
 assert.equal(m.hasContact,false);assert.equal(m.hasNotes,false);assert.equal(m.projectCount,0);
 assert.match(source('components/ClientDossier.jsx'),/Chưa có số điện thoại hoặc email/);
 assert.match(source('components/ClientDossier.jsx'),/hasNotes&&/);
});
test('v237 uses persisted client schema only, with no write/fetch inside read-only view',()=>{
 const jsx=source('components/ClientDossier.jsx');
 const helper=source('lib/client-profile.js');
 for(const field of ['client.name','client.code','client.type','client.phone','client.email','client.address','client.notes']){
   if(field==='client.type')assert.match(jsx,/contactDisplayType\(client\.type\)/);
   else assert.ok(jsx.includes(field),field);
 }
 assert.doesNotMatch(helper,/\bfetch\(|\bapi\(|localStorage|sessionStorage/);
 assert.match(jsx,/can\('client.write'\)/);
});
test('v237 standalone preview contains all basic fields and real edit workflow',()=>{
 const preview=readFileSync(new URL('../../docs/previews/dossier.html',import.meta.url),'utf8');
 for(const label of ['Họ và tên','Mã hồ sơ','Vai trò','Điện thoại','Email','Địa chỉ liên hệ','Tài sản liên quan','Hợp đồng tại tài sản liên quan'])assert.ok(preview.includes(label),label);
 assert.match(preview,/form\.onsubmit=/);
 assert.match(preview,/related\.showModal\(/);
 assert.doesNotMatch(preview,/Cách thử|Nhấn Tab|Thử phím|Mở thử/);
});
