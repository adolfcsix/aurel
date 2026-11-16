import {fail,samePersistedId} from './domain.js';
/** Prevent an unreviewed deposit receipt from invalidating a settlement.
 * New leases have their own independent deposit ledger. */
export function assertCanReceiveDeposit(db,lease){
 if(lease.status!=='active'&&lease.status!=='draft')fail('Không thể nhận thêm cọc cho hợp đồng đã kết thúc hoặc lưu trữ',409);
 if(db.depositSettlements.some(p=>samePersistedId(p.leaseId,lease.id)&&['pending','approved'].includes(p.status)))
  fail('Đang có đề nghị hoàn cọc chờ xử lý; hãy giải quyết trước khi ghi nhận tiền mới',409);
}

/** Guard against directly editing an apartment's deposit after ledger activity. */
export const hasDepositLedgerForUnit=(db,unitId)=>
 (db.depositTransactions||[]).some(t=>samePersistedId(t.unitId,unitId)) ||
 (db.depositSettlements||[]).some(t=>t.status!=='rejected' && (samePersistedId(t.unitId,unitId) ||
  // Some historical settlement records link only through the lease.
  (db.leases||[]).some(l=>samePersistedId(l.id,t.leaseId)&&samePersistedId(l.unitId,unitId))));

/** Compare normalized money values, not request representation ("5000000" vs 5000000).
 * Only a genuine reference amount change needs to be prevented after evidence exists. */
export function assertSafeDepositReferenceEdit(db,unitId,previous,next){
 if(previous===next)return;
 if(hasDepositLedgerForUnit(db,unitId))fail('Số dư cọc đã có chứng từ; không thể sửa trực tiếp');
}
