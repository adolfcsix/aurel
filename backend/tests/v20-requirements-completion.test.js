import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../src/seed.js';
import {upgrade} from '../src/store.js';
import {create,generateSchedules,paidFor,reminderQueue} from '../src/domain.js';
import {cleanFloor,cleanRoom} from '../src/spatial-validation.js';
import {cleanUnit} from '../src/unit-validation.js';
import {archiveRecord,restoreRecord} from '../src/lifecycle.js';
import {prepareUnitImport,applyUnitImport,normalizeInterior,inferImportMapping} from '../src/import-units.js';
import {mappedRowsToCsv} from '../src/xlsx-units.js';
import {scanDataQuality} from '../src/data-quality.js';
import {queueDailyInternalReminders} from '../src/reminder-jobs.js';
const actor={id:'admin',name:'QA Admin'};
const db=()=>upgrade(seed());
function makeLocation(d){
 const building=d.buildings.find(b=>b.projectId==='rose'&&b.code==='DV02');
 const floor=create(cleanFloor({buildingId:building.id,code:'35',name:'Tầng 35'},d));d.floors.push(floor);
 const room=create(cleanRoom({floorId:floor.id,code:'3502',name:'Phòng 02'},d));d.rooms.push(room);
 return {building,floor,room};
}
test('V2.0 migration adds floor/room catalogs without changing old contracts, payments or optional labels',()=>{
 const d=db();assert.equal(d.version,9);assert.deepEqual(d.floors,[]);assert.deepEqual(d.rooms,[]);
 assert.equal(d.units.find(u=>u.id==='u2').floor,'21');assert.ok(d.leases.length>0);assert.ok(d.payments.length>0);
});
test('new floors and rooms permit draft records with missing parent identifiers',()=>{
 const d=db();const floor=cleanFloor({code:'TỰ DO'},d);d.floors.push(create(floor));
 const room=cleanRoom({code:'P.08'},d);d.rooms.push(create(room));
 assert.equal(floor.buildingId,'');assert.equal(room.floorId,'');
});
test('unit links room → floor → building → project, preserving optional interior attributes',()=>{
 const d=db(),{room,floor,building}=makeLocation(d);
 const u=cleanUnit({code:'DV02-3502',roomId:room.id,interiorStatus:'furnished',interiorNotes:'Sofa và bàn ăn'},d,{
  id:'draft-x',status:'draft',feeBasis:'due',code:'',projectId:'',buildingId:'',floorId:'',roomId:''});
 assert.equal(u.floorId,floor.id);assert.equal(u.buildingId,building.id);assert.equal(u.projectId,'rose');
 assert.equal(u.floor,'35');assert.equal(u.room,'3502');assert.equal(u.interiorStatus,'furnished');
 assert.equal(u.interiorNotes,'Sofa và bàn ăn');
});
test('free-text floor/room and missing interior never block draft creation',()=>{
 const d=db();const u=cleanUnit({code:'DIY-15',floor:'15',room:'08',interiorStatus:'',interiorNotes:''},d,{status:'draft',feeBasis:'due',code:''});
 assert.equal(u.floor,'15');assert.equal(u.room,'08');assert.equal(u.interiorStatus,'');
 assert.equal(u.floorId,undefined);
});
test('spatial hierarchy rejects mismatched room and floor references',()=>{
 const d=db(),{room}=makeLocation(d),other=create(cleanFloor({buildingId:d.buildings.find(b=>b.code==='DV04').id,code:'15'},d));d.floors.push(other);
 assert.throws(()=>cleanUnit({roomId:room.id,floorId:other.id},d,{id:'temp',status:'draft',feeBasis:'due'}),/không thuộc tầng/);
});
test('spatial catalogue rejects duplicate codes within the same parent',()=>{
 const d=db(),{building,floor,room}=makeLocation(d);
 assert.throws(()=>cleanFloor({buildingId:building.id,code:'35'},d),/trùng/);
 assert.throws(()=>cleanRoom({floorId:floor.id,code:room.code},d),/trùng/);
});
test('cannot archive an in-use floor/room; archived room can be restored',()=>{
 const d=db(),{floor,room}=makeLocation(d);
 const u=d.units.find(x=>x.id==='u2');Object.assign(u,cleanUnit({roomId:room.id},d,u));
 assert.equal(u.floorId,floor.id);
 assert.throws(()=>{if(d.units.some(x=>x.status!=='archived'&&x.roomId===room.id))throw Error('Phòng còn căn hộ liên kết')},/liên kết/);
 u.roomId='';u.floorId='';
 archiveRecord(d,'rooms',room.id,actor);assert.equal(room.status,'archived');
 restoreRecord(d,'rooms',room.id,actor);assert.equal(room.status,'active');
});
test('restoring a floor rejects missing archived parent building',()=>{
 const d=db(),{floor,building}=makeLocation(d);
 archiveRecord(d,'floors',floor.id,actor);building.status='archived';
 assert.throws(()=>restoreRecord(d,'floors',floor.id,actor),/Tòa nhà cha/);
});
test('CSV import includes interior but does not require any interior column',()=>{
 const d=db(),source='Mã căn,Dự án,Nội thất,Ghi chú nội thất,Giá thuê\nQ-112,Rose Town,Đầy đủ,Sofa bàn ăn,13000000';
 const report=prepareUnitImport(d,source);
 assert.equal(report.errors.length,0);assert.equal(report.valid,1);
 assert.equal(report.prepared[0].interiorStatus,'furnished');
 assert.equal(report.prepared[0].interiorNotes,'Sofa bàn ăn');
 const before=d.units.length;applyUnitImport(d,source,actor);
 assert.equal(d.units.length,before+1);assert.equal(d.units.at(-1).interiorStatus,'furnished');
 const prior=prepareUnitImport(d,'Mã căn,Dự án\nQ-113,Rose Town');assert.equal(prior.errors.length,0);
});
test('unrecognized interior descriptions are preserved in notes instead of silently losing information',()=>{
 const d=db(),report=prepareUnitImport(d,'Mã căn,Dự án,Nội thất\nQ-114,Rose Town,Máy lọc không khí mới');
 assert.equal(report.errors.length,0);assert.equal(report.prepared[0].interiorStatus,'');
 assert.equal(report.prepared[0].interiorNotes,'Máy lọc không khí mới');
 assert.equal(report.warnings.length,1);
 assert.equal(normalizeInterior('Nội thất cơ bản'),'partial');
});
test('XLSX mapping passes interior columns through existing server CSV validation',()=>{
 const rows=[['Mã căn','Dự án','Nội thất','Ghi chú nội thất'],['Q-115','Rose Town','Cơ bản','Có giường']];
 const csv=mappedRowsToCsv(rows,inferImportMapping(rows[0]));
 const report=prepareUnitImport(db(),csv);assert.equal(report.valid,1);
 assert.equal(report.prepared[0].interiorStatus,'partial');
 assert.equal(report.prepared[0].interiorNotes,'Có giường');
});
test('data quality flags orphan floor and room relations without flagging empty draft fields',()=>{
 const d=db();d.units.find(u=>u.id==='u6').floorId='lost-floor';
 const issues=scanDataQuality(d).issues;assert.ok(issues.some(x=>x.code==='MISSING_FLOOR'));
 assert.ok(!issues.some(x=>x.code==='UNKNOWN_INTERIOR'));
});
test('monthly reminders and partial payments retain distinct rent periods',()=>{
 const d=db(),lease=d.leases.find(l=>l.unitId==='u2');
 const schedules=d.schedules.filter(s=>s.leaseId===lease.id&&s.status==='open');
 assert.ok(schedules.some(s=>s.period==='2026-11'));assert.ok(schedules.some(s=>s.period==='2026-12'));
 const nov=schedules.find(s=>s.period==='2026-11');
 const originally=paidFor(d,nov.id);assert.ok(originally>=0);
 const before=d.payments.length,initial=queueDailyInternalReminders(d,'2026-11-20');
 assert.ok(initial.created>=0);assert.equal(d.payments.length,before);
 assert.equal(queueDailyInternalReminders(d,'2026-11-20').created,0);
 assert.ok(reminderQueue(d,'2026-11-20').every(s=>s.left>0));
});

test('V2.0 bulk interior update is valid, previewed and preserved on commit without touching payment ledger', async()=>{
 const {simulateBulkUnits,commitBulkUnits}=await import('../src/bulk-units.js');
 const d=db(),before=structuredClone(d.payments),request={ids:['u1','u2'],changes:{interiorStatus:'partial',interiorNotes:'Bàn ghế cơ bản'}};
 const p=simulateBulkUnits(d,request,cleanUnit,{day:'2026-11-11'});
 assert.equal(p.changed,2);assert.equal(d.units.find(u=>u.id==='u1').interiorStatus,undefined);
 const done=commitBulkUnits(d,{...request,fingerprint:p.fingerprint},cleanUnit,actor,{day:'2026-11-11'});
 assert.equal(done.updated,2);assert.equal(d.units.find(u=>u.id==='u2').interiorStatus,'partial');
 assert.deepEqual(d.payments,before);
});
test('V2.0 invalid interior status is rejected for single and bulk edits',async()=>{
 const d=db(),target=d.units.find(u=>u.id==='u1');
 assert.throws(()=>cleanUnit({interiorStatus:'invalid'},d,target),/nội thất/);
 const {simulateBulkUnits}=await import('../src/bulk-units.js');
 assert.throws(()=>simulateBulkUnits(d,{ids:['u1'],changes:{interiorStatus:'broken'}},cleanUnit,{day:'2026-11-11'}),/nội thất/);
});

test('V2.0 editing a room automatically updates its floor and building without forcing all dropdowns',()=>{
 const d=db(),{room}=makeLocation(d),unit=d.units.find(u=>u.id==='u4');
 const updated=cleanUnit({roomId:room.id},d,unit);
 assert.equal(updated.projectId,'rose');
 assert.equal(updated.roomId,room.id);
 assert.equal(updated.floor,'35');
 assert.equal(updated.building,'DV02');
});
test('V2.0 moving a unit to another project clears stale location links and preserves draft information',()=>{
 const d=db(),{room}=makeLocation(d),unit=d.units.find(u=>u.id==='u6');
 Object.assign(unit,cleanUnit({roomId:room.id},d,unit));
 const moved=cleanUnit({projectId:'imperia'},d,unit);
 assert.equal(moved.projectId,'imperia');
 assert.equal(moved.buildingId,'');assert.equal(moved.floorId,'');assert.equal(moved.roomId,'');
 assert.equal(moved.interiorStatus||'','');
});
