// Maker-checker control for deposits. Approval never moves money;
// execution writes exactly one settlement transaction after rechecking balance.
import {create,depositBalance,fail,text,vnd,find,log,businessDate,validateDate,samePersistedId,financialIdempotencyKey} from './domain.js';
const current=new Set(['pending','approved']);
export function submitDepositProposal(db,leaseId,input,actor){
 const lease=find(db.leases,leaseId,'Hợp đồng');if(lease.status!=='ended')fail('Hợp đồng phải kết thúc trước khi đề nghị hoàn cọc');
 // A replay of an auto-calculated refund must not recalculate today's balance.
 // Compare supplied fields only; absent amounts retain the original request's defaults.
 const key=financialIdempotencyKey(input.idempotencyKey);
 if(key){
  const old=db.depositSettlements.find(p=>p.idempotencyKey===key);
  if(old){
   const explicitRefund=Object.hasOwn(input,'refund')&&input.refund!=null;
   const explicitDeduction=Object.hasOwn(input,'deduction')&&input.deduction!=null;
   if(!samePersistedId(old.leaseId,lease.id)||
      (explicitRefund&&old.refund!==vnd(input.refund,'Số hoàn'))||
      (explicitDeduction&&old.deduction!==vnd(input.deduction,'Đối trừ'))||
      (Object.hasOwn(input,'note')&&old.note!==text(input.note,500)))
    fail('Mã đề nghị đã dùng với dữ liệu khác',409);
   return old;
  }
 }
 if(db.depositSettlements.some(p=>samePersistedId(p.leaseId,lease.id)&&current.has(p.status)))fail('Đang có đề nghị hoàn cọc chờ xử lý',409);
 const balance=depositBalance(db,lease.id),deduction=vnd(input.deduction||0,'Đối trừ'),refund=vnd(input.refund??balance-deduction,'Tiền hoàn');
 if(balance<=0||refund===null||deduction===null||deduction+refund>balance||deduction+refund<=0)fail('Số tiền hoàn và đối trừ không hợp lệ');
 const note=text(input.note,500);if(deduction>0&&note.length<5)fail('Cần ghi rõ căn cứ đối trừ');
 const row=create({leaseId:lease.id,unitId:lease.unitId,refund,deduction,note,status:'pending',createdBy:actor.id,createdByName:actor.name,idempotencyKey:key,requestedAt:new Date().toISOString(),balanceAtRequest:balance});db.depositSettlements.push(row);log(db,actor,'deposit.proposal.created',row.id,null,row);return row;
}
export function approveDepositProposal(db,id,actor){const proposal=find(db.depositSettlements,id,'Đề nghị');if(proposal.status!=='pending')fail('Đề nghị không còn chờ duyệt',409);if(samePersistedId(proposal.createdBy,actor.id))fail('Không được tự duyệt đề nghị của mình',403);proposal.status='approved';proposal.approvedBy=actor.id;proposal.approvedAt=new Date().toISOString();log(db,actor,'deposit.proposal.approved',proposal.id);return proposal}
export function rejectDepositProposal(db,id,actor,reason){const proposal=find(db.depositSettlements,id,'Đề nghị');if(!['pending','approved'].includes(proposal.status))fail('Không thể từ chối đề nghị đã kết thúc',409);if(text(reason,500).length<5)fail('Cần nhập lý do từ chối');proposal.status='rejected';proposal.rejectedBy=actor.id;proposal.rejectedAt=new Date().toISOString();proposal.rejectionReason=text(reason,500);log(db,actor,'deposit.proposal.rejected',proposal.id);return proposal}
export function executeDepositProposal(db,id,actor,confirmation={},executionDay=businessDate()){const proposal=find(db.depositSettlements,id,'Đề nghị');if(proposal.status==='executed'){
  const existing=db.depositTransactions.find(t=>samePersistedId(t.proposalId,proposal.id));
  if(!existing)fail('Không tìm thấy giao dịch hoàn cọc đã xác nhận',409);
  const submittedReference=text(confirmation.reference,120);
  if(submittedReference&&submittedReference!==existing.reference)fail('Hồ sơ đã được chi với mã chứng từ khác',409);
  return existing;
 }if(proposal.status!=='approved')fail('Đề nghị chưa được phê duyệt',409);
 const lease=find(db.leases,proposal.leaseId,'Hợp đồng');if(lease.status!=='ended')fail('Hợp đồng không ở trạng thái kết thúc');
 if(samePersistedId(proposal.createdBy,actor.id))fail('Người lập đề nghị không được tự xác nhận chi tiền',403);
 if(samePersistedId(proposal.approvedBy,actor.id))fail('Người phê duyệt không được tự xác nhận chi tiền',403);
 const held=depositBalance(db,proposal.leaseId);if(held!==proposal.balanceAtRequest||proposal.refund+proposal.deduction>held)fail('Số dư cọc đã thay đổi, phải lập lại đề nghị',409);
 const reference=text(confirmation.reference,120);if(reference.length<4)fail('Cần mã giao dịch hoặc mã chứng từ chi cọc');
 if(db.depositTransactions.some(t=>t.kind==='settle'&&t.reference===reference))fail('Mã chứng từ hoàn cọc đã được sử dụng',409);
 const transaction=create({reference,leaseId:proposal.leaseId,unitId:proposal.unitId,kind:'settle',amount:proposal.refund+proposal.deduction,refund:proposal.refund,deduction:proposal.deduction,note:proposal.note,date:validateDate(executionDay,'Ngày ghi nhận hoàn cọc'),by:actor.id,proposalId:proposal.id});db.depositTransactions.push(transaction);
 proposal.status='executed';proposal.executedBy=actor.id;proposal.executedAt=new Date().toISOString();proposal.transactionId=transaction.id;log(db,actor,'deposit.proposal.executed',proposal.id,null,transaction);return transaction;
}
