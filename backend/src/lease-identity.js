/** Persisted optional tenant-client reference; legacy tenantName remains untouched. */
import {validateClientLink} from './client-validation.js';
import {fail,text,number,vnd,validateDate,find,samePersistedId} from './domain.js';
export function leasePayload(input,db,old={}){const lease={...old};
 for(const key of ['unitId','tenantId','tenantName','startsOn','endsOn','status','notes'])if(key in input)lease[key]=text(input[key],key==='notes'?1200:240);
 // Optional client dossier reference; never match or create a person by tenantName.
 if(lease.tenantId&&!samePersistedId(lease.tenantId,old.tenantId))validateClientLink(find(db.clients,lease.tenantId,'Hồ sơ khách thuê'),'tenant');
 for(const key of ['rent','depositExpected'])if(key in input)lease[key]=vnd(input[key],key);
 if('paymentDay' in input){lease.paymentDay=number(input.paymentDay,'Ngày thanh toán',31);if(lease.paymentDay!=null&&(!Number.isInteger(lease.paymentDay)||lease.paymentDay<1))fail('Ngày thanh toán không hợp lệ')}
 if(lease.unitId)find(db.units,lease.unitId,'Căn hộ');
 validateDate(lease.startsOn,'Ngày bắt đầu');validateDate(lease.endsOn,'Ngày kết thúc');
 if(lease.startsOn&&lease.endsOn&&lease.startsOn>lease.endsOn)fail('Ngày hợp đồng bị đảo');
 if(!['draft','active','ended','archived'].includes(lease.status))fail('Trạng thái hợp đồng không hợp lệ');
 if(lease.status==='active'&&(!lease.unitId||!lease.startsOn||!lease.endsOn||lease.rent==null))fail('Cần căn hộ, thời hạn và giá thuê để kích hoạt hợp đồng');
 if(lease.unitId&&lease.status==='active'&&lease.startsOn&&lease.endsOn&&db.leases.some(l=>!samePersistedId(l.id,old.id)&&samePersistedId(l.unitId,lease.unitId)&&l.status==='active'&&l.startsOn&&l.endsOn&&l.startsOn<=lease.endsOn&&l.endsOn>=lease.startsOn))fail('Có hợp đồng đang hoạt động trùng thời gian tại căn hộ này');
 return lease;
}

/** Shared lease guard for unit edits, archiving and occupancy mirroring. */
export const hasActiveUnitLease=(db,unitId,exceptLeaseId)=>db.leases.some(l=>l.status==='active'&&samePersistedId(l.unitId,unitId)&&(!exceptLeaseId||!samePersistedId(l.id,exceptLeaseId)));
