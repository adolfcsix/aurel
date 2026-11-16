/**
 * Record a rent receipt. An idempotency replay must be resolved BEFORE evaluating
 * the mutable schedule status: the original period may have been archived,
 * reconciled or closed since the first successful request.
 */
import {create,fail,find,paidFor,text,vnd,validateDate,log,businessDate,active,samePersistedId,financialIdempotencyKey} from './domain.js';
const supplied=(value)=>value!==null&&value!==undefined&&value!=='';

export function postRentPayment(db,input,actor,day=businessDate()){
 const amount=vnd(input?.amount,'Tiền thu');
 if(amount===null||amount<=0)fail('Số tiền thu phải lớn hơn 0');
 const key=financialIdempotencyKey(input?.idempotencyKey);
 if(key){
  const old=db.payments.find(p=>p.idempotencyKey===key);
  if(old){
   const matchesScope=supplied(input.scheduleId)?samePersistedId(old.scheduleId,input.scheduleId):
    Boolean(supplied(input.unitId)&&supplied(input.period)&&samePersistedId(old.unitId,input.unitId)&&old.period===input.period);
   const matchesUnit=!supplied(input.unitId)||samePersistedId(old.unitId,input.unitId);
   const matchesPeriod=!supplied(input.period)||old.period===input.period;
   const matchesDate=!input.date||old.date===validateDate(input.date,'Ngày thực thu');
   const matchesReference=!input.reference||old.reference===text(input.reference,100);
   const matchesMethod=!input.method||old.method===text(input.method,80);
   const matchesNote=!Object.hasOwn(input,'note')||old.note===text(input.note,500);
   if(!matchesScope||!matchesUnit||!matchesPeriod||old.amount!==amount||!matchesDate||!matchesReference||!matchesMethod||!matchesNote)
    fail('Khóa giao dịch đã được dùng cho yêu cầu khác',409);
   return old;
  }
 }
 const schedule=supplied(input.scheduleId)?find(db.schedules,input.scheduleId,'Kỳ thanh toán'):(()=>{
  const candidates=db.schedules.filter(s=>samePersistedId(s.unitId,input.unitId)&&s.period===input.period&&active(s));
  if(candidates.length>1)fail('Có nhiều kỳ thu khớp căn hộ và tháng; hãy chọn chính xác kỳ thu',409);
  return candidates[0];
 })();
 if(!schedule)fail('Không tìm thấy kỳ thanh toán hợp lệ',404);
 // A stale client must not silently post money against a different lease/period.
 if((supplied(input.unitId)&&!samePersistedId(input.unitId,schedule.unitId))||(supplied(input.period)&&input.period!==schedule.period))
  fail('Kỳ thu không khớp căn hộ hoặc tháng đã chọn',409);
 if(schedule.status!=='open')fail('Kỳ thu này chưa được đối soát hoặc đã đóng; không thể ghi nhận tiền',409);
 const lease=find(db.leases,schedule.leaseId,'Hợp đồng');
 if(lease.status!=='active'&&lease.status!=='ended')fail('Hợp đồng chưa kích hoạt');
 if(amount>schedule.amount-paidFor(db,schedule.id))fail('Số tiền thu lớn hơn số còn phải thu; không ghi nhận thừa vào kỳ này');
 const date=validateDate(input.date||day,'Ngày thực thu');
 if(date>day)fail('Không được ghi nhận tiền vào ngày tương lai');
 const record=create({unitId:schedule.unitId,leaseId:lease.id,scheduleId:schedule.id,period:schedule.period,amount,date,
  method:text(input.method||'Chuyển khoản',80),reference:text(input.reference,100),note:text(input.note,500),
  idempotencyKey:key,status:'posted',createdBy:actor.id});
 db.payments.push(record);log(db,actor,'payment.posted',record.id,null,record);return record;
}
