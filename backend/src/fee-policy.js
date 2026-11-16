/**
 * Apply an apartment-specific fee policy in exactly one place.
 * A blank percentage means "inherit the configured company default", not 0%.
 * Snapshot the resolved percentage when the policy is applied; older periods
 * with any receipt history remain untouched (including reversed receipts).
 */
import {create,hasPaymentHistory,fail,samePersistedId} from './domain.js';

export function resolvedFeePercent(configured,preferences){
 const percent=configured ?? preferences?.defaultFee ?? 0;
 if(typeof percent!=='number'||!Number.isFinite(percent)||percent<0||percent>100)
  fail('Tỷ lệ phí quản lý không hợp lệ');
 return percent;
}
export function applyUnitFeePolicy(db,{unitId,before,after,effectiveFrom,reason,actorId}){
 const resolved=resolvedFeePercent(after.feePercent,db.preferences);
 const policy=create({
  unitId,percent:resolved,configuredPercent:after.feePercent??null,
  inheritedDefault:after.feePercent==null,basis:after.feeBasis,
  effectiveFrom,reason,previousPercent:before.feePercent??null,
  changedBy:actorId
 });
 db.feeHistory.push(policy);
 let updatedPeriods=0;
 for(const schedule of db.schedules){
  if(!samePersistedId(schedule.unitId,unitId)||schedule.status!=='open'||schedule.dueOn<effectiveFrom||hasPaymentHistory(db,schedule.id))continue;
  schedule.feePercent=resolved;
  schedule.feeBasis=after.feeBasis;
  updatedPeriods++;
 }
 return {policy,updatedPeriods};
}
