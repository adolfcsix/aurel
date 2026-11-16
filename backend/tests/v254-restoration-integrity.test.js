import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreRecord,archiveRecord} from '../src/lifecycle.js';

const actor={id:'admin',name:'QA'};
const db=()=>({
 projects:[{id:1,status:'active'}],
 buildings:[{id:2,projectId:'1',code:'B',status:'active'}],
 floors:[{id:3,buildingId:2,code:'03',status:'active'}],
 rooms:[{id:4,floorId:'3',code:'04',status:'active'}],
 units:[],staff:[],clients:[],leases:[],audit:[]
});
const archived=(id,fields={})=>({id,status:'archived',archiveMeta:{status:'draft'},...fields});
test('V2.54: restore archived unit by string route ID when stored ID is numeric',()=>{
 const state=db();const row=archived(8,{projectId:'1',buildingId:'2',floorId:'3',roomId:'4',code:'A-204',feeBasis:'due'});
 state.units.push(row);
 const result=restoreRecord(state,'units','8',actor);
 assert.equal(result.status,'draft');assert.equal(result.floor,'03');assert.equal(result.room,'04');
 assert.equal(state.audit.length,1);
});
test('V2.54: restore rejects duplicate unit code within same numeric/string parent IDs',()=>{
 const state=db();state.units.push({id:20,projectId:1,buildingId:2,code:'A-204',status:'draft'});
 state.units.push(archived(21,{projectId:'1',buildingId:'2',code:'A-204'}));
 assert.throws(()=>restoreRecord(state,'units','21',actor),/Mã căn trùng/);
 assert.equal(state.units[1].status,'archived');
});
test('V2.54: restore archived floor rejects duplicate within same building despite ID representation',()=>{
 const state=db();state.floors.push(archived(7,{buildingId:'2',code:'03'}));
 assert.throws(()=>restoreRecord(state,'floors','7',actor),/Mã tầng đã tồn tại/);
});
test('V2.54: restore archived building rejects duplicate within same project despite ID representation',()=>{
 const state=db();state.buildings.push(archived(7,{projectId:1,code:'B'}));
 assert.throws(()=>restoreRecord(state,'buildings','7',actor),/Mã tòa đã tồn tại/);
});
test('V2.54: restore archived room rejects duplicate within same floor despite ID representation',()=>{
 const state=db();state.rooms.push(archived(7,{floorId:3,code:'04'}));
 assert.throws(()=>restoreRecord(state,'rooms','7',actor),/Mã phòng đã tồn tại/);
});
test('V2.54: archiving client with active contract is blocked with mixed numeric/string IDs',()=>{
 const state=db();state.clients=[{id:5,type:'tenant',status:'active'}];state.leases=[{id:9,tenantId:'5',status:'active'}];
 assert.throws(()=>archiveRecord(state,'clients',5,actor),/hợp đồng có hiệu lực/);
});

test('V2.54: shared dependency guard blocks archival when children use numeric/string IDs',async()=>{
 const {hasActiveLink}=await import('../src/lifecycle.js');
 const state=db();state.units=[{id:8,projectId:'1',buildingId:'2',floorId:'3',roomId:'4',managerId:7,ownerId:5,status:'draft'}];
 assert.equal(hasActiveLink(state,'units','projectId',1),true);
 assert.equal(hasActiveLink(state,'units','buildingId',2),true);
 assert.equal(hasActiveLink(state,'units','floorId',3),true);
 assert.equal(hasActiveLink(state,'units','roomId',4),true);
 assert.equal(hasActiveLink(state,'units','managerId','7'),true);
 assert.equal(hasActiveLink(state,'units','ownerId','5'),true);
 assert.equal(hasActiveLink(state,'units','roomId','04'),false);
 state.units[0].status='archived';
 assert.equal(hasActiveLink(state,'units','roomId',4),false);
});
