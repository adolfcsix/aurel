/**
 * Changing the company default affects only apartments that inherit it.
 * The issued percentage of a schedule with ANY receipt history remains immutable,
 * including after a receipt has been reversed.
 *
 * A company-wide change is immediate (Vietnam business day). Scheduling a future
 * global policy requires a separate activation job and is deliberately not implied.
 */
import {active,create,fail,hasPaymentHistory,text,samePersistedId} from './domain.js';

export function changeCompanyDefaultFee(db,newPercent,{effectiveOn,actorId,reason}={}){
 if(typeof newPercent!=='number'||!Number.isFinite(newPercent)||newPercent<0||newPercent>100)
  fail('Phí quản lý mặc định phải nằm trong khoảng 0–100%');
 const previous=db.preferences?.defaultFee??0;
 if(previous===newPercent)return {changed:false,affectedUnits:0,updatedSchedules:0,protectedSchedules:0};
 const explanation=text(reason,500);
 if(explanation.length<5)fail('Cần ghi lý do thay đổi phí mặc định (ít nhất 5 ký tự)');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(effectiveOn||''))fail('Thiếu ngày hiệu lực phí mặc định');
 // A timeline is needed when a previously unseen historic lease is later imported.
 // It prevents using today's new default for older periods that predate this change.
 if(!Array.isArray(db.preferences.defaultFeeHistory))db.preferences.defaultFeeHistory=[];
 if(!db.preferences.defaultFeeHistory.length)db.preferences.defaultFeeHistory.push(create({percent:previous,effectiveFrom:'0001-01-01',reason:'Mức mặc định trước lần thay đổi đầu tiên'}));
 db.preferences.defaultFeeHistory.push(create({percent:newPercent,effectiveFrom:effectiveOn,reason:explanation,changedBy:actorId||'system'}));
 let affectedUnits=0,updatedSchedules=0,protectedSchedules=0;
 for(const unit of db.units){
  if(!active(unit)||unit.feePercent!==null&&unit.feePercent!==undefined)continue;
  const policyRows=db.feeHistory.filter(p=>samePersistedId(p.unitId,unit.id));
  // Preserve the old default for future backfills of pre-change monthly periods.
  if(!policyRows.some(p=>p.effectiveFrom<effectiveOn)){
   db.feeHistory.push(create({unitId:unit.id,percent:previous,configuredPercent:null,
    inheritedDefault:true,basis:unit.feeBasis||'due',effectiveFrom:'0001-01-01',
    reason:'Mức phí mặc định trước khi điều chỉnh',changedBy:'system'}));
  }
  db.feeHistory.push(create({unitId:unit.id,percent:newPercent,configuredPercent:null,
   inheritedDefault:true,basis:unit.feeBasis||'due',effectiveFrom:effectiveOn,
   previousPercent:previous,reason:explanation,changedBy:actorId||'system'}));
  affectedUnits++;
  for(const schedule of db.schedules){
   if(!samePersistedId(schedule.unitId,unit.id)||schedule.dueOn<effectiveOn)continue;
   if(schedule.status!=='open'||hasPaymentHistory(db,schedule.id)){
    protectedSchedules++;continue;
   }
   schedule.feePercent=newPercent;
   updatedSchedules++;
  }
 }
 db.preferences.defaultFee=newPercent;
 return {changed:true,previousPercent:previous,newPercent,affectedUnits,updatedSchedules,protectedSchedules};
}
