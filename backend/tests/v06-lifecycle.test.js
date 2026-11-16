import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveRecord,restoreRecord,archiveListing} from '../src/lifecycle.js';

const actor={id:'admin',name:'Quản trị'};
const record=(id,other={})=>({id,createdAt:'2026-01-01T00:00:00.000Z',status:'active',...other});
const fixture=()=>({
 projects:[record('p1',{name:'Rose Town'})],
 buildings:[record('b1',{projectId:'p1',code:'DV2'})],
 units:[record('u1',{projectId:'p1',buildingId:'b1',code:'DV2-2104',status:'vacant',rent:9500000,feePercent:6,feeBasis:'due'})],
 staff:[record('s1',{name:'Luyện'})],clients:[record('c1',{name:'Chủ sở hữu'})],
 leases:[record('l1',{unitId:'u1',status:'draft',rent:9500000})],
 schedules:[],payments:[],feeHistory:[],audit:[]
});

test('archive and restore retains actual unit data, original status and audit history',()=>{
 const db=fixture(),unit=db.units[0];const original=structuredClone(unit);
 assert.equal(archiveRecord(db,'units',unit.id,actor).archived,true);
 assert.equal(unit.status,'archived');assert.equal(unit.archiveMeta.status,'vacant');
 const restored=restoreRecord(db,'units',unit.id,actor);
 assert.equal(restored.status,'vacant');assert.equal(restored.rent,original.rent);
 assert.equal(restored.feePercent,original.feePercent);assert.equal(db.audit.length,2);
 assert.equal(db.audit[0].event,'units.restore');
});
test('restoring unit with missing parent is prohibited',()=>{
 const db=fixture();archiveRecord(db,'units','u1',actor);
 archiveRecord(db,'buildings','b1',actor);
 assert.throws(()=>restoreRecord(db,'units','u1',actor),/Tòa nhà cha không tồn tại/);
 restoreRecord(db,'buildings','b1',actor);
 assert.equal(restoreRecord(db,'units','u1',actor).status,'vacant');
});
test('duplicate codes and project names prevent restore',()=>{
 const db=fixture();archiveRecord(db,'units','u1',actor);
 db.units.push(record('u2',{projectId:'p1',buildingId:'b1',code:'dv2-2104',status:'vacant'}));
 assert.throws(()=>restoreRecord(db,'units','u1',actor),/Mã căn trùng/);
 assert.equal(db.units[0].status,'archived');
 const projects=fixture();archiveRecord(projects,'projects','p1',actor);
 projects.projects.push(record('p2',{name:'rose town'}));
 assert.throws(()=>restoreRecord(projects,'projects','p1',actor),/Tên dự án/);
});
test('restoring archived unit is impossible while linked owner is archived',()=>{
 const db=fixture();db.units[0].ownerId='c1';archiveRecord(db,'units','u1',actor);archiveRecord(db,'clients','c1',actor);
 assert.throws(()=>restoreRecord(db,'units','u1',actor),/Chủ sở hữu không tồn tại/);
 restoreRecord(db,'clients','c1',actor);assert.equal(restoreRecord(db,'units','u1',actor).status,'vacant');
});
test('lease restore does not activate contract or issue schedules',()=>{
 const db=fixture();archiveRecord(db,'leases','l1',actor);
 assert.equal(restoreRecord(db,'leases','l1',actor).status,'draft');assert.equal(db.schedules.length,0);
});
test('old archived unit without archive metadata is restored conservatively as draft',()=>{
 const db=fixture();db.units[0].status='archived';assert.equal(restoreRecord(db,'units','u1',actor).status,'draft');
});
test('archived records listing respects write permissions and is sorted',()=>{
 const db=fixture();archiveRecord(db,'projects','p1',actor);archiveRecord(db,'staff','s1',actor);
 const admin=archiveListing(db,()=>true),limited=archiveListing(db,p=>p==='project.write');
 assert.equal(admin.length,2);assert.deepEqual(limited.map(x=>x.collection),['projects']);
 assert.ok(admin.every(x=>!('rent' in x) && !('feePercent' in x)));
});
test('restore rejects nonarchived and unknown types without changing records',()=>{
 const db=fixture();assert.throws(()=>restoreRecord(db,'units','u1',actor),/chưa được lưu trữ/);
 assert.throws(()=>restoreRecord(db,'whatever','u1',actor),/không hỗ trợ/);
 assert.throws(()=>restoreRecord(db,'constructor','u1',actor),/không hỗ trợ/);
 assert.equal(db.units[0].status,'vacant');assert.equal(db.audit.length,0);
});
