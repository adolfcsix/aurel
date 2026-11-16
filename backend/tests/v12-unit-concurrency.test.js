import test from 'node:test';
import assert from 'node:assert/strict';
import {assertUnitRevision,bumpUnitRevision,unitRevision} from '../src/unit-revisions.js';
import {simulateBulkUnits,commitBulkUnits} from '../src/bulk-units.js';
import {cleanUnit} from '../src/unit-validation.js';

const today='2026-11-11';
const sample=()=>({units:[{id:'u1',code:'A-01',projectId:'p1',buildingId:'',building:'T1',floor:'3',room:'',address:'',owner:'',tenant:'',ownerId:'',tenantId:'',managerId:'',saleId:'',notes:'',leaseStart:'',leaseEnd:'',feeBasis:'due',status:'vacant',area:null,bedrooms:null,rent:null,renewalRent:null,feePercent:6,deposit:null,paymentDay:null}],projects:[{id:'p1',name:'P',status:'active'}],buildings:[],staff:[],clients:[],schedules:[],feeHistory:[],payments:[],audit:[]});
test('V1.2: legacy records begin with revision zero and changes advance it',()=>{const u={id:'u1'};assert.equal(unitRevision(u),0);bumpUnitRevision(u);assert.equal(u.revision,1);assert.match(u.updatedAt,/^\d{4}-\d{2}-\d{2}T/)});
test('V1.2: stale editing session is rejected with conflict',()=>{const u={revision:3};assert.doesNotThrow(()=>assertUnitRevision(u,3));bumpUnitRevision(u);assert.throws(()=>assertUnitRevision(u,3),e=>e.status===409)});
test('V1.2: malformed and negative revision are rejected',()=>{assert.throws(()=>assertUnitRevision({revision:1},'1'),e=>e.status===400);assert.throws(()=>assertUnitRevision({revision:1},-1),e=>e.status===400)});
test('V1.2: missing revision cannot bypass conflict detection',()=>{assert.throws(()=>assertUnitRevision({revision:8},undefined),e=>e.status===428)});
test('V1.2: changed bulk record increments revision atomically',()=>{const db=sample();const actor={id:'manager',name:'Trưởng bộ phận'};const input={ids:['u1'],changes:{floor:'9'}};const preview=simulateBulkUnits(db,input,cleanUnit,{day:today});const committed=commitBulkUnits(db,{...input,fingerprint:preview.fingerprint},cleanUnit,actor,{day:today});assert.equal(committed.updated,1);assert.equal(db.units[0].revision,1);assert.equal(db.units[0].floor,'9')});
test('V1.2: idempotent bulk edit does not needlessly increment record revision',()=>{const db=sample();const input={ids:['u1'],changes:{floor:'3'}};const preview=simulateBulkUnits(db,input,cleanUnit,{day:today});const committed=commitBulkUnits(db,{...input,fingerprint:preview.fingerprint},cleanUnit,{id:'m',name:'Manager'},{day:today});assert.equal(committed.updated,0);assert.equal(db.units[0].revision,undefined)});
