import test from 'node:test';
import assert from 'node:assert/strict';
import {create,feeFor,companyDefaultFeeAt,generateSchedules} from '../src/domain.js';
import {changeCompanyDefaultFee} from '../src/default-fee-policy.js';
import {queueDailyInternalReminders} from '../src/reminder-jobs.js';

const actor={id:'qa-admin',name:'QA Admin'};
const day='2026-11-11';
function fixture(){
 const inherited=create({id:'inherit',feePercent:null,feeBasis:'due',status:'occupied'});
 const explicit=create({id:'explicit',feePercent:3.7,feeBasis:'due',status:'occupied'});
 const archived=create({id:'archived',feePercent:null,feeBasis:'due',status:'archived'});
 const schedules=[
  create({id:'past',unitId:inherited.id,dueOn:'2026-11-01',amount:10000000,feePercent:6,feeBasis:'due',status:'open'}),
  create({id:'future',unitId:inherited.id,dueOn:'2026-12-01',amount:10000000,feePercent:6,feeBasis:'due',status:'open'}),
  create({id:'reversed',unitId:inherited.id,dueOn:'2026-12-02',amount:10000000,feePercent:6,feeBasis:'due',status:'open'}),
  create({id:'explicit-future',unitId:explicit.id,dueOn:'2026-12-01',amount:10000000,feePercent:3.7,feeBasis:'due',status:'open'}),
  create({id:'archived-future',unitId:archived.id,dueOn:'2026-12-01',amount:10000000,feePercent:6,feeBasis:'due',status:'open'})
 ];
 const payments=[create({id:'reversed-payment',scheduleId:'reversed',amount:1000000,status:'reversed'})];
 return {preferences:{defaultFee:6,reminderDays:5},units:[inherited,explicit,archived],schedules,payments,feeHistory:[],audit:[]};
}
test('V2.1 company fee edit reprices only uncollected inherited future periods',()=>{
 const db=fixture(),result=changeCompanyDefaultFee(db,4.5,{effectiveOn:day,reason:'Điều chỉnh biểu phí công ty',actorId:actor.id});
 assert.equal(result.affectedUnits,1);assert.equal(result.updatedSchedules,1);
 assert.equal(db.preferences.defaultFee,4.5);
 assert.equal(db.schedules.find(s=>s.id==='future').feePercent,4.5);
 assert.equal(feeFor(db,db.schedules.find(s=>s.id==='future')),450000);
 assert.equal(db.schedules.find(s=>s.id==='past').feePercent,6);
 assert.equal(db.schedules.find(s=>s.id==='reversed').feePercent,6);
 assert.equal(db.schedules.find(s=>s.id==='explicit-future').feePercent,3.7);
 assert.equal(db.schedules.find(s=>s.id==='archived-future').feePercent,6);
 assert.equal(result.protectedSchedules,1);
 assert.equal(db.feeHistory.filter(h=>h.unitId==='inherit').length,2);
 assert.ok(db.feeHistory.some(h=>h.unitId==='inherit'&&h.changedBy===actor.id&&h.percent===4.5));
});
test('V2.1 default changes have dated history for new schedules and preserve old backfills',()=>{
 const db=fixture();changeCompanyDefaultFee(db,4.5,{effectiveOn:day,reason:'Phê duyệt chính sách mới',actorId:actor.id});
 assert.equal(companyDefaultFeeAt(db.preferences,'2026-10-01'),6);
 assert.equal(companyDefaultFeeAt(db.preferences,'2026-12-01'),4.5);
 db.units.push(create({id:'new-unit',feePercent:null,feeBasis:'due',status:'occupied'}));
 const lease=create({id:'new-lease',unitId:'new-unit',status:'active',startsOn:'2026-10-01',endsOn:'2026-12-31',rent:10000000,paymentDay:1});
 db.leases=[lease];
 const schedules=generateSchedules(db,lease);
 assert.equal(schedules.find(s=>s.period==='2026-10').feePercent,6);
 assert.equal(schedules.find(s=>s.period==='2026-12').feePercent,4.5);
});
test('V2.1 0% is valid but blank default, missing reason and invalid percent are rejected',()=>{
 const db=fixture();
 assert.throws(()=>changeCompanyDefaultFee(db,null,{effectiveOn:day,reason:'Đủ lý do'}),/0–100%/);
 assert.throws(()=>changeCompanyDefaultFee(db,101,{effectiveOn:day,reason:'Đủ lý do'}),/0–100%/);
 assert.throws(()=>changeCompanyDefaultFee(db,4,{effectiveOn:day,reason:'x'}),/lý do/);
 assert.equal(db.preferences.defaultFee,6);assert.equal(db.feeHistory.length,0);
 changeCompanyDefaultFee(db,0,{effectiveOn:day,reason:'Miễn phí quản lý',actorId:actor.id});
 assert.equal(db.preferences.defaultFee,0);assert.equal(db.schedules.find(s=>s.id==='future').feePercent,0);
 const unchanged=changeCompanyDefaultFee(db,0,{effectiveOn:day});assert.equal(unchanged.changed,false);
});
test('V2.1 approaching deadlines still create one upcoming reminder if service resumes late',()=>{
 const db={preferences:{reminderDays:5},schedules:[create({id:'s1',unitId:'u1',leaseId:'l1',period:'2026-11',dueOn:'2026-11-16',amount:9000000,status:'open'})],leases:[{id:'l1',status:'active'}],payments:[],reminderContacts:[],reminderNotifications:[],audit:[]};
 assert.equal(queueDailyInternalReminders(db,'2026-11-14').created,1);
 assert.equal(db.reminderNotifications[0].kind,'upcoming');
 assert.equal(queueDailyInternalReminders(db,'2026-11-15').created,0);
 assert.equal(queueDailyInternalReminders(db,'2026-11-16').created,1);
 assert.equal(db.reminderNotifications.at(-1).kind,'due');
 assert.equal(queueDailyInternalReminders(db,'2026-11-17').created,1);
 assert.equal(db.reminderNotifications.at(-1).kind,'overdue');
 assert.equal(db.payments.length,0);
});
