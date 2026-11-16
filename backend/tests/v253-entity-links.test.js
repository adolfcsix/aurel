import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanClient} from '../src/client-validation.js';
import {cleanUnit} from '../src/unit-validation.js';
import {cleanFloor,cleanRoom,checkUnitLocation} from '../src/spatial-validation.js';

const data=()=>({
 projects:[{id:7,name:'Khu A',status:'active'},{id:'07',name:'Khu B',status:'active'}],
 buildings:[{id:8,projectId:7,code:'A',status:'active'}],
 floors:[{id:30,buildingId:'8',projectId:'7',code:'03',status:'active'}],
 rooms:[{id:50,floorId:'30',buildingId:'8',projectId:7,code:'01',status:'active'}],
 clients:[{id:101,type:'both',status:'active'},{id:102,type:'both',status:'active'}],
 staff:[],units:[],leases:[]
});
const unit=(overrides={})=>({id:'unit-current',code:'A-120',projectId:7,buildingId:8,building:'A',floorId:'',roomId:'',floor:'',room:'',status:'draft',feeBasis:'due',leaseStart:'',leaseEnd:'',...overrides});

test('V2.53: archived ownership with numeric/string IDs blocks incompatible client role change',()=>{
 const db=data();db.units=[unit({ownerId:'101',tenantId:'102',status:'archived'})];
 assert.throws(()=>cleanClient({type:'tenant'},db,db.clients[0]),e=>e.status===409);
 assert.throws(()=>cleanClient({type:'owner'},db,db.clients[1]),e=>e.status===409);
 assert.equal(cleanClient({type:'both'},db,db.clients[0]).type,'both');
});
test('V2.53: leading-zero client ID is distinct from unpadded number',()=>{
 const db=data();db.units=[unit({ownerId:'0101'})];
 assert.equal(cleanClient({type:'tenant'},db,db.clients[0]).type,'tenant');
});
test('V2.53: active lease prevents role downgrade with numeric/string identifier',()=>{
 const db=data();db.leases=[{id:900,tenantId:'101',status:'active'}];
 assert.throws(()=>cleanClient({type:'owner'},db,db.clients[0]),e=>e.status===409);
});
test('V2.53: duplicate unit code cannot bypass mixed-type project/building IDs',()=>{
 const db=data();db.units=[unit({id:'existing',projectId:'7',buildingId:'8'})];
 assert.throws(()=>cleanUnit({},db,unit({id:'another'})),/Mã căn bị trùng/);
});
test('V2.53: legacy numeric project and building IDs support safe edit/reopen',()=>{
 const db=data();const edited=cleanUnit({area:72.5,bedrooms:2,code:'A-121'},db,unit());
 assert.equal(edited.area,72.5);assert.equal(edited.projectId,7);assert.equal(edited.buildingId,8);
 assert.deepEqual(cleanUnit({},db,structuredClone(edited)),edited);
});
test('V2.53: hierarchy checks accept string and numeric IDs but not different parents',()=>{
 const db=data();const updated=checkUnitLocation(unit({roomId:'50',floorId:30,buildingId:8}),db);
 assert.equal(updated.roomId,'50');assert.equal(String(updated.floorId),'30');
 assert.throws(()=>checkUnitLocation(unit({roomId:'50',floorId:'031'}),db),/không thuộc tầng/);
});
test('V2.53: editing same floor does not treat numeric/string building reference as move',()=>{
 const db=data();db.units=[unit({floorId:'30'})];
 const current=db.floors[0];
 assert.equal(cleanFloor({buildingId:'8',code:'03',name:'Tầng 3'},db,current).code,'03');
 assert.throws(()=>cleanFloor({buildingId:'',code:'03'},db,current),e=>e.status===409);
});
test('V2.53: floor code uniqueness and self-exclusion use persisted IDs',()=>{
 const db=data();db.floors.push({id:'31',buildingId:8,code:'03',status:'active'});
 assert.throws(()=>cleanFloor({buildingId:'8',code:'03'},db,db.floors[0]),e=>e.status===409);
 db.floors.pop();
 assert.equal(cleanFloor({buildingId:'8',code:'03'},db,{...db.floors[0],id:'30'}).code,'03');
});
test('V2.53: editing same room with mixed floor IDs remains allowed; real move is blocked',()=>{
 const db=data();db.units=[unit({roomId:50})];
 assert.equal(cleanRoom({floorId:30,code:'01'},db,db.rooms[0]).code,'01');
 assert.throws(()=>cleanRoom({floorId:'',code:'01'},db,db.rooms[0]),e=>e.status===409);
});
test('V2.53: duplicate room code cannot bypass mixed floor IDs',()=>{
 const db=data();db.rooms.push({id:51,floorId:30,code:'01',status:'active'});
 assert.throws(()=>cleanRoom({floorId:'30',code:'01'},db,db.rooms[0]),/Mã phòng bị trùng/);
});
