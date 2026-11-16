import test from 'node:test';
import assert from 'node:assert/strict';
import {scopedUnitLocationField,changeUnitLocationDraft} from '../src/lib/editor-sections.js';
import {sameDossierId} from '../src/lib/dossier-id.js';
const data={
 buildings:[{id:11,projectId:1,code:'A'},{id:12,projectId:2,code:'B'}],
 floors:[{id:21,buildingId:'11',projectId:1,code:'03'},{id:22,buildingId:'12',projectId:2,code:'05'}],
 rooms:[{id:31,floorId:'21',buildingId:11,code:'01'},{id:32,floorId:'22',buildingId:12,code:'08'}]
};
const schema=name=>({name,options:data[name==='buildingId'?'buildings':name==='floorId'?'floors':'rooms'].map(x=>({value:x.id,label:x.code}))});
const options=(name,draft)=>scopedUnitLocationField(schema(name),data,draft).options.map(x=>x.value);
test('V2.53: project scopes building, floor and room selections without hiding valid numeric/string descendants',()=>{
 const d={projectId:'1',buildingId:'',floorId:''};
 assert.deepEqual(options('buildingId',d),[11]);
 assert.deepEqual(options('floorId',d),[21]);
 assert.deepEqual(options('roomId',d),[31]);
});
test('V2.53: selected building and floor narrow only their descendants',()=>{
 assert.deepEqual(options('floorId',{buildingId:'12'}),[22]);
 assert.deepEqual(options('roomId',{floorId:'21'}),[31]);
});
test('V2.53: blank optional location fields keep the full catalog available',()=>{
 const d={projectId:'',buildingId:'',floorId:''};
 assert.deepEqual(options('buildingId',d),[11,12]);
 assert.deepEqual(options('floorId',d),[21,22]);
 assert.deepEqual(options('roomId',d),[31,32]);
});
test('V2.53: changing project clears obsolete building/floor/room selections and free-text mirrors',()=>{
 const draft={projectId:1,buildingId:11,floorId:21,roomId:31,building:'A',floor:'03',room:'01',notes:'Giữ nguyên'};
 const next=changeUnitLocationDraft(draft,'projectId','2',data);
 assert.equal(next.projectId,'2');
 for(const key of ['buildingId','floorId','roomId','building','floor','room'])assert.equal(next[key],'');
 assert.equal(next.notes,'Giữ nguyên');assert.equal(draft.roomId,31);
});
test('V2.53: choosing another building automatically changes project and clears previous child links',()=>{
 const result=changeUnitLocationDraft({projectId:1,buildingId:11,floorId:21,roomId:31},'buildingId','12',data);
 assert.ok(sameDossierId(result.projectId,2));assert.equal(result.building,'B');assert.equal(result.floorId,'');assert.equal(result.roomId,'');
});
test('V2.53: choosing floor or room updates all ancestor fields, preserving room location on reopen',()=>{
 const floor=changeUnitLocationDraft({projectId:1,buildingId:11,floorId:21,roomId:31},'floorId','22',data);
 assert.ok(sameDossierId(floor.buildingId,12));assert.equal(floor.roomId,'');assert.equal(floor.floor,'05');
 const room=changeUnitLocationDraft(floor,'roomId','32',data);
 assert.ok(sameDossierId(room.projectId,2));assert.ok(sameDossierId(room.floorId,22));assert.equal(room.room,'08');
 assert.equal(changeUnitLocationDraft(room,'notes','Sửa ghi chú',data).roomId,'32');
});
test('V2.53: re-selecting same persisted location with numeric/string ID does not clear child selections',()=>{
 const draft={projectId:1,buildingId:11,floorId:21,roomId:31};
 const next=changeUnitLocationDraft(draft,'projectId','1',data);
 assert.equal(next.floorId,21);assert.equal(next.roomId,31);
});
