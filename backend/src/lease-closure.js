/**
 * End an active lease without erasing past invoicing or money received.
 * Cancels ONLY future, fully unpaid schedules; paid / part-paid periods remain reviewable.
 */
import {fail,validateDate,paidFor,log,text,samePersistedId} from './domain.js';
import {createHash} from 'node:crypto';
import {bumpRecordRevision,updateRecordFields} from './record-revisions.js';
// Editing contract fields is distinct from ending an active contract.
// Closure must go through a reviewed fingerprint and explicit reconciliation.
export function assertReviewedLeaseTransition(before,updated){
 if(before.status==='active'&&updated.status==='ended')
  fail('Hãy dùng chức năng Kết thúc hợp đồng để xem trước công nợ và xác nhận.',409);
}
export function previewLeaseClosure(db,lease,input={},currentDay){
 if(lease.status!=='active')fail('Chỉ kết thúc hợp đồng đang hoạt động',409);
 const effectiveOn=validateDate(input.effectiveOn||currentDay,'Ngày kết thúc thực tế');
 if(!effectiveOn||effectiveOn>currentDay)fail('Ngày kết thúc thực tế không thể ở tương lai');
 if(lease.startsOn&&effectiveOn<lease.startsOn)fail('Ngày kết thúc không được trước ngày bắt đầu hợp đồng');
 const affected=db.schedules.filter(s=>samePersistedId(s.leaseId,lease.id)&&s.status==='open');
 const cancelled=affected.filter(s=>s.dueOn>effectiveOn&&paidFor(db,s.id)===0);
 const retained=affected.filter(s=>!cancelled.includes(s));
 const debt=retained.reduce((sum,s)=>sum+Math.max(0,s.amount-paidFor(db,s.id)),0);
 const fingerprint=createHash('sha256').update(JSON.stringify({effectiveOn,lease,
  schedules:affected,payments:db.payments.filter(p=>samePersistedId(p.leaseId,lease.id))})).digest('hex');
 return {fingerprint,effectiveOn,cancelledCount:cancelled.length,cancelledAmount:cancelled.reduce((a,s)=>a+s.amount,0),retainedCount:retained.length,retainedDebt:debt,
  paidFuturePeriods:retained.filter(s=>s.dueOn>effectiveOn&&paidFor(db,s.id)>0).length,
  cancelledIds:cancelled.map(s=>s.id)};
}
export function closeLease(db,lease,input,actor,currentDay){
 const preview=previewLeaseClosure(db,lease,input,currentDay);
 const reason=text(input?.reason,600);
 if(reason.length<5)fail('Nhập lý do kết thúc hợp đồng (từ 5 ký tự)');
 const old=structuredClone(lease);
 lease.status='ended';lease.terminatedOn=preview.effectiveOn;lease.terminationReason=reason;bumpRecordRevision(lease);
 lease.terminatedAt=new Date().toISOString();lease.terminatedBy=actor.id;
 for(const s of db.schedules){if(preview.cancelledIds.includes(s.id)){
  s.status='cancelled';s.cancelledOn=preview.effectiveOn;s.cancelledAt=lease.terminatedAt;s.cancelReason='Kết thúc hợp đồng trước hạn';
 }}
 // Resolve notifications that now refer to cancelled or post-termination periods.
 const obsolete=db.schedules.filter(s=>samePersistedId(s.leaseId,lease.id)&&s.dueOn>preview.effectiveOn).map(s=>s.id);
 for(const notice of db.reminderNotifications||[]){
  if(obsolete.some(id=>samePersistedId(id,notice.scheduleId))&&notice.status==='unread'){
   notice.status='resolved';notice.resolvedAt=lease.terminatedAt;notice.resolveReason='Hợp đồng kết thúc trước hạn';
  }
 }
 const unit=db.units.find(u=>samePersistedId(u.id,lease.unitId));
 if(unit&&!db.leases.some(l=>!samePersistedId(l.id,lease.id)&&samePersistedId(l.unitId,unit.id)&&l.status==='active'))updateRecordFields(unit,{status:'ended'});
 log(db,actor,'lease.closed',lease.id,old,{...lease,settlement:preview});
 return {...lease,closure:preview};
}
