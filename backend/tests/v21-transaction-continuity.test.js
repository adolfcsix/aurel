/** Tests the application JSON repository transaction, not only a copied object. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {create} from '../src/domain.js';
import {changeCompanyDefaultFee} from '../src/default-fee-policy.js';

const dataDir=mkdtempSync(path.join(tmpdir(),'aurel-v21-fee-'));
process.env.AUREL_STORAGE='json';
process.env.AUREL_DEMO_DATA_DIR=dataDir;
const {resetDb,updateDb,getDb}=await import('../src/store.js');
const context={effectiveOn:'2026-11-11',reason:'Cập nhật phí theo quyết định công ty',actorId:'qa-manager'};

test('V2.1 company fee change persists atomically without changing issued history',async()=>{
 await resetDb();
 await updateDb(db=>{
  db.units.push(create({id:'inherited-draft',code:'QA21',feePercent:null,feeBasis:'due',status:'draft'}));
  db.schedules.push(create({id:'qa21-future',unitId:'inherited-draft',dueOn:'2026-12-11',amount:10000000,feePercent:6,feeBasis:'due',status:'open'}));
  db.schedules.push(create({id:'qa21-history',unitId:'inherited-draft',dueOn:'2026-11-15',amount:10000000,feePercent:6,feeBasis:'due',status:'open'}));
  db.payments.push(create({id:'qa21-reversal',scheduleId:'qa21-history',amount:4000000,status:'reversed'}));
 });
 const updated=await updateDb(db=>changeCompanyDefaultFee(db,5,context));
 assert.equal(updated.updatedSchedules,1);
 const db=await getDb();
 assert.equal(db.preferences.defaultFee,5);
 assert.equal(db.schedules.find(s=>s.id==='qa21-future').feePercent,5);
 assert.equal(db.schedules.find(s=>s.id==='qa21-history').feePercent,6);
 assert.equal(db.payments.find(p=>p.id==='qa21-reversal').status,'reversed');
 assert.ok(db.feeHistory.some(h=>h.unitId==='inherited-draft'&&h.percent===5));
});
test('V2.1 rejected fee changes roll back preferences and all schedule records',async()=>{
 const before=JSON.stringify(await getDb());
 await assert.rejects(()=>updateDb(db=>changeCompanyDefaultFee(db,7,{...context,reason:'no'})),/lý do/);
 assert.equal(JSON.stringify(await getDb()),before);
});
process.on('exit',()=>{try{rmSync(dataDir,{recursive:true,force:true})}catch{}});
