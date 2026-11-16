/** Synchronize a property's displayed lease fields and invalidate stale unit editors. */
import {find} from './domain.js';
import {hasActiveUnitLease} from './lease-identity.js';
import {updateRecordFields} from './record-revisions.js';

export function mirrorLease(db,lease){
 if(!lease.unitId)return false;
 const unit=find(db.units,lease.unitId,'Căn hộ');
 if(lease.status==='active')return updateRecordFields(unit,{
  status:'occupied',rent:lease.rent,paymentDay:lease.paymentDay,
  leaseStart:lease.startsOn,leaseEnd:lease.endsOn,tenant:lease.tenantName||unit.tenant
 });
 if(lease.status==='ended'&&!hasActiveUnitLease(db,unit.id,lease.id))return updateRecordFields(unit,{status:'ended'});
 return false;
}
