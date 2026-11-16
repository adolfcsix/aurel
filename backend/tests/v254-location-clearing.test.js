import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanUnit} from '../src/unit-validation.js';
import {checkUnitLocation} from '../src/spatial-validation.js';

const db=()=>({
 projects:[{id:'p',status:'active'},{id:'q',status:'active'}],
 buildings:[{id:'b',projectId:'p',code:'B',status:'active'},{id:'other',projectId:'q',code:'C',status:'active'}],
 floors:[{id:'f',buildingId:'b',projectId:'p',code:'03',status:'active'},
         {id:'plain',buildingId:'other',projectId:'q',name:'Tầng trệt',status:'active'}],
 rooms:[{id:'r',floorId:'f',buildingId:'b',projectId:'p',code:'010',status:'active'},
        {id:'no-code',floorId:'plain',buildingId:'other',projectId:'q',name:'Phòng lễ tân',status:'active'}],
 staff:[],clients:[],units:[]
});
const old=()=>({id:'u',code:'001',status:'draft',feeBasis:'due',projectId:'p',buildingId:'b',floorId:'f',roomId:'r',building:'B',floor:'03',room:'010',notes:'Không thay đổi',area:76.5});
const fields=u=>[u.projectId,u.buildingId,u.floorId,u.roomId,u.building,u.floor,u.room];

test('V2.54: clearing floor via partial API change drops stale room ID and both labels',()=>{
 const u=cleanUnit({floorId:''},db(),old());
 assert.deepEqual(fields(u),['p','b','','','B','','']);
 assert.equal(u.notes,'Không thay đổi');assert.equal(u.area,76.5);
});
test('V2.54: clearing building does not orphan child IDs or retain stale position labels',()=>{
 const u=cleanUnit({buildingId:''},db(),old());
 assert.deepEqual(fields(u),['p','','','','','','']);
});
test('V2.54: clearing project removes entire former hierarchy and keeps unrelated draft values',()=>{
 const u=cleanUnit({projectId:''},db(),old());
 assert.deepEqual(fields(u),['','','','','','','']);
 assert.equal(u.area,76.5);
});
test('V2.54: clearing only room retains floor and building without phantom room label',()=>{
 const u=cleanUnit({roomId:''},db(),old());
 assert.deepEqual(fields(u),['p','b','f','','B','03','']);
});
test('V2.54: moving building also clears stale free-text floor and room values',()=>{
 const u=cleanUnit({buildingId:'other'},db(),old());
 assert.deepEqual(fields(u),['q','other','','','C','','']);
});
test('V2.54: selecting code-less catalog entries uses their name, not a stale previous code',()=>{
 const u=cleanUnit({roomId:'no-code'},db(),old());
 assert.deepEqual(fields(u),['q','other','plain','no-code','C','Tầng trệt','Phòng lễ tân']);
});
test('V2.54: location clearing followed by a reopened edit must not reconstruct old links',()=>{
 const state=db();const cleared=cleanUnit({floorId:''},state,old());
 const reopened=cleanUnit({notes:'Đã kiểm tra'},state,structuredClone(cleared));
 assert.deepEqual(fields(reopened),fields(cleared));
 assert.equal(reopened.notes,'Đã kiểm tra');
});
test('V2.54: deliberate contradictory floor+room still rejected, never silently remapped',()=>{
 assert.throws(()=>cleanUnit({floorId:'plain',roomId:'r'},db(),{...old(),roomId:'',room:''}),/không thuộc tầng/);
});
test('V2.54: a location without catalog links can still keep manual floor and room text',()=>{
 const d=db();const bare={...old(),floorId:'',roomId:'',floor:'Tầng kỹ thuật',room:'Căn phía Nam'};
 const u=cleanUnit({notes:'Bản nháp'},d,bare);
 assert.equal(u.floor,'Tầng kỹ thuật');assert.equal(u.room,'Căn phía Nam');
});
test('V2.54: floor-only reconciliation uses name when code is empty',()=>{
 const d=db();const u=checkUnitLocation({...old(),floorId:'plain',roomId:'',buildingId:'other',projectId:'q',floor:'cũ'},d);
 assert.equal(u.floor,'Tầng trệt');
});
