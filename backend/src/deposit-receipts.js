/**
 * Idempotent recording of a deposit receipt. This domain operation is used by
 * the HTTP route and can be tested without Express or a live payment service.
 */
import {assertCanReceiveDeposit} from './finance-guards.js';
import {create,fail,find,log,text,vnd,businessDate,samePersistedId,financialIdempotencyKey} from './domain.js';

export function receiveDeposit(db,leaseId,input={},actor,day=businessDate()){
 const lease=find(db.leases,leaseId,'Hợp đồng');
 const amount=vnd(input.amount,'Tiền đặt cọc');
 if(amount===null||amount<1)fail('Tiền nhận phải lớn hơn 0');
 const key=financialIdempotencyKey(input.idempotencyKey);
 const note=text(input.note,500);
 if(key){
  const old=db.depositTransactions.find(t=>t.idempotencyKey===key);
  if(old){
   if(!samePersistedId(old.leaseId,lease.id)||old.kind!=='receive'||old.amount!==amount||
      (Object.hasOwn(input,'note')&&old.note!==note))
    fail('Khóa giao dịch cọc đã được dùng cho dữ liệu khác',409);
   return old;
  }
 }
 assertCanReceiveDeposit(db,lease);
 const row=create({leaseId:lease.id,unitId:lease.unitId,kind:'receive',amount,
  date:day,note,by:actor.id,idempotencyKey:key});
 db.depositTransactions.push(row);
 log(db,actor,'deposit.receive',row.id,null,row);
 return row;
}
