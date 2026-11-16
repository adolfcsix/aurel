import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanClient} from '../src/client-validation.js';
import {cleanUnit} from '../src/unit-validation.js';
import {scanDataQuality} from '../src/data-quality.js';
import {restoreRecord} from '../src/lifecycle.js';

const db=()=>({
 projects:[{id:'p1',name:'Estate',status:'active'}],buildings:[],staff:[],
 clients:[
  {id:'c-owner',name:'Owner',type:'owner',status:'active'},
  {id:'c-tenant',name:'Tenant',type:'tenant',status:'active'},
  {id:'c-both',name:'Both',type:'both',status:'active'}],
 units:[{id:'u-old',projectId:'p1',buildingId:'',building:'T1',code:'A1',ownerId:'c-owner',tenantId:'c-tenant',status:'archived'}]
});
const base={id:'u-new',projectId:'p1',buildingId:'',building:'T1',code:'A2',ownerId:'',tenantId:'',status:'draft',feeBasis:'due',leaseStart:'',leaseEnd:''};

test('V1.9: customer may be created without contact details',()=>{
 assert.deepEqual(cleanClient({type:'owner'},db()).name,'');
});
test('V1.9: owner cannot be assigned as tenant-only and tenant cannot be assigned as owner',()=>{
 assert.throws(()=>cleanUnit({ownerId:'c-tenant'},db(),base),e=>e.status===409);
 assert.throws(()=>cleanUnit({tenantId:'c-owner'},db(),base),e=>e.status===409);
});
test('V1.9: customer with both roles can appear in either relationship',()=>{
 const data=db();const result=cleanUnit({ownerId:'c-both',tenantId:'c-both'},data,base);
 assert.equal(result.ownerId,'c-both');assert.equal(result.tenantId,'c-both');
});
test('V1.9: linked owner/tenant cannot lose role, even if related unit is archived',()=>{
 const data=db();
 assert.throws(()=>cleanClient({type:'tenant',name:'Owner'},data,data.clients[0]),e=>e.status===409);
 assert.throws(()=>cleanClient({type:'owner',name:'Tenant'},data,data.clients[1]),e=>e.status===409);
 assert.equal(cleanClient({type:'both',name:'Owner'},data,data.clients[0]).type,'both');
});
test('V1.9: after ownership is reassigned, changing prior customer role is allowed',()=>{
 const data=db();data.units[0].ownerId='c-both';
 assert.equal(cleanClient({type:'tenant',name:'Owner'},data,data.clients[0]).type,'tenant');
});
test('V1.9: archived and nonexistent customers cannot be newly linked',()=>{
 const data=db();data.clients[0].status='archived';
 assert.throws(()=>cleanUnit({ownerId:'c-owner'},data,base),e=>e.status===404);
 assert.throws(()=>cleanUnit({tenantId:'missing'},data,base),e=>e.status===404);
});

test('V1.9: quality scanner flags mismatched legacy client roles without exposing private contacts',()=>{
 const data=db();data.units.push({...base,ownerId:'c-tenant',tenantId:'c-owner'});
 const report=scanDataQuality({...data,leases:[],schedules:[],payments:[],depositTransactions:[],depositSettlements:[],feeHistory:[]});
 assert.ok(report.issues.some(x=>x.code==='OWNER_ROLE_MISMATCH'));
 assert.ok(report.issues.some(x=>x.code==='TENANT_ROLE_MISMATCH'));
 assert.equal(JSON.stringify(report).includes('email'),false);
});

test('V1.9: restore archived unit checks roles again before reactivating linked customers',()=>{
 const data=db();data.audit=[];data.units[0].ownerId='c-tenant';
 const actor={id:'manager',name:'Manager'};
 assert.throws(()=>restoreRecord(data,'units','u-old',actor),e=>e.status===409);
 assert.equal(data.units[0].status,'archived');
});
