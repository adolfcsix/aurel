import {randomUUID} from 'node:crypto';
export const fail=(message,status=400)=>{const error=new Error(message);error.status=status;throw error};
export const text=(v,max=240)=>v==null?'':String(v).trim().slice(0,max);
/** Payment retry identities must never be silently truncated into another key. */
export const financialIdempotencyKey=(value)=>{
 if(value==null)return '';
 if(typeof value!=='string')fail('Khóa giao dịch phải là chuỗi ký tự',400);
 const key=value.trim();
 if(key.length>120)fail('Khóa giao dịch không được vượt quá 120 ký tự',400);
 return key;
};
export const number=(v,field,max=1e12)=>{
 if(v===null||v===undefined||(typeof v==='string'&&v.trim()===''))return null;
 if(typeof v==='boolean'||Array.isArray(v)||typeof v==='object')fail(`${field} không hợp lệ`);
 const n=Number(v);if(!Number.isFinite(n)||n<0||n>max)fail(`${field} không hợp lệ`);return n;
};
export const vnd=(v,field)=>{const n=number(v,field);if(n!==null&&!Number.isSafeInteger(n))fail(`${field}: số tiền VND phải là số nguyên`);return n};
export const percent=(v)=>{const n=number(v,'Tỷ lệ phí',100);return n};
// Dates for operational financial events follow the configured Vietnam business day,
// not UTC (which can still be on the previous date in the morning).
export const businessDate=(clock=new Date())=>{
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(clock);
 const fields=Object.fromEntries(parts.map(part=>[part.type,part.value]));
 return `${fields.year}-${fields.month}-${fields.day}`;
};
export const dateOk=(v)=>!v||(/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(new Date(v+'T00:00:00Z').getTime())&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v);
export const validateDate=(v,label)=>{if(!dateOk(v))fail(`${label} không hợp lệ`);return v||''};
/** Equal nonblank persisted identifiers, retaining leading zeros. Never compare names. */
export const samePersistedId=(left,right)=>{
 if(left==null||right==null)return false;
 if((typeof left==='number'&&!Number.isFinite(left))||(typeof right==='number'&&!Number.isFinite(right)))return false;
 const a=String(left).trim(),b=String(right).trim();
 return a.length>0&&b.length>0&&a===b;
};
export const active=(x)=>x.status!=='archived';
export const find=(arr,id,label='Hồ sơ')=>{const entry=arr.find(x=>samePersistedId(x.id,id)&&active(x));if(!entry)fail(`${label} không tồn tại`,404);return entry};
export const create=(values)=>({id:randomUUID(),createdAt:new Date().toISOString(),status:'active',...values});
// Sensitive fields must never be written to new audit snapshots or returned from legacy audit rows.
// Do not mutate source records: the business transaction still owns the original data.
const AUDIT_PRIVATE_KEYS=new Set(['password','passwordhash','newpassword','currentpassword','csrf','csrftoken','sessiontoken','token','cookie','authorization','accesstoken','refreshtoken','secret','clientsecret','apikey','databaseurl','idempotencykey']);
export const redactAuditValue=(value)=>{
 if(Array.isArray(value))return value.map(redactAuditValue);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[
  key,AUDIT_PRIVATE_KEYS.has(key.toLowerCase().replace(/[-_]/g,''))?'[ĐÃ ẨN]':redactAuditValue(item)
 ]));
 return value;
};
export const safeAuditEntry=(entry)=>redactAuditValue(entry);
export const log=(db,actor,event,objectId,before=null,after=null)=>{
 db.audit.unshift(create({userId:actor?.id||'system',user:actor?.name||'Hệ thống',event,objectId,before:redactAuditValue(before),after:redactAuditValue(after),time:new Date().toISOString()}));
};
export const clampDay=(year,month,day)=>{
 const last=new Date(Date.UTC(year,month,0)).getUTCDate();return `${year}-${String(month).padStart(2,'0')}-${String(Math.min(day,last)).padStart(2,'0')}`;
};
export const monthSequence=(start,end)=>{
 const first=start.slice(0,7),last=end.slice(0,7),result=[];let [y,m]=first.split('-').map(Number);
 while(`${y}-${String(m).padStart(2,'0')}`<=last&&result.length<120){result.push(`${y}-${String(m).padStart(2,'0')}`);m++;if(m===13){m=1;y++}}
 if(result.length>=120&&result.at(-1)!==last)fail('Hợp đồng vượt giới hạn lập lịch 120 tháng');return result;
};
// Resolve the company default at the scheduled due date, not at the time a
// historical contract happens to be entered into the application.
export function companyDefaultFeeAt(preferences,dueOn){
 const entries=(preferences?.defaultFeeHistory||[]).filter(item=>item.effectiveFrom<=dueOn)
  .sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom)||(a.createdAt||'').localeCompare(b.createdAt||''));
 return entries.at(-1)?.percent??preferences?.defaultFee??0;
}
export function generateSchedules(db,lease){
 if(lease.status!=='active'||!lease.unitId||!lease.startsOn||!lease.endsOn||lease.rent==null)return [];
 const unit=find(db.units,lease.unitId,'Căn hộ');
 const months=monthSequence(lease.startsOn,lease.endsOn);const created=[];
 for(const period of months){
  if(db.schedules.some(x=>samePersistedId(x.leaseId,lease.id)&&x.period===period&&active(x)))continue;
  const [y,m]=period.split('-').map(Number);let dueOn=clampDay(y,m,lease.paymentDay||1);
  if(dueOn<lease.startsOn)dueOn=lease.startsOn;
  // Final rent cycle cannot become due after the lease has already ended.
  if(dueOn>lease.endsOn)dueOn=lease.endsOn;
  const policy=[...db.feeHistory].filter(x=>samePersistedId(x.unitId,unit.id)&&x.effectiveFrom<=dueOn).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom)||(b.createdAt||'').localeCompare(a.createdAt||''))[0];
  const feePercent=policy?.percent??unit.feePercent??companyDefaultFeeAt(db.preferences,dueOn),feeBasis=policy?.basis??unit.feeBasis??'due';
  const schedule=create({leaseId:lease.id,unitId:unit.id,period,dueOn,amount:lease.rent,feePercent,feeBasis,status:'open'});
  db.schedules.push(schedule);created.push(schedule);
 }
 return created;
}
export const paidFor=(db,scheduleId)=>db.payments.filter(x=>samePersistedId(x.scheduleId,scheduleId)&&x.status==='posted').reduce((s,x)=>s+x.amount,0);
// A reversed receipt remains an auditable financial event. Never silently reprice that period.
export const hasPaymentHistory=(db,scheduleId)=>db.payments.some(x=>samePersistedId(x.scheduleId,scheduleId));
export const feeFor=(db,schedule)=>{
 const paid=paidFor(db,schedule.id),base=schedule.feeBasis==='paid'?Math.min(schedule.amount,paid):schedule.amount;
 return Math.round(base*(schedule.feePercent||0)/100);
};
export const depositBalance=(db,leaseId)=>db.depositTransactions.filter(t=>samePersistedId(t.leaseId,leaseId)).reduce((sum,t)=>sum+(t.kind==='receive'?t.amount:-t.amount),0);
export const defaultPeriod=()=>businessDate().slice(0,7);
// Reminder contact outcomes are operational records, never payment receipts.
export const REMINDER_OUTCOMES={called:'Đã gọi điện',messaged:'Đã nhắn tin',promised:'Khách hẹn thanh toán',unreachable:'Chưa liên hệ được',other:'Ghi nhận khác'};
export function reminderQueue(db,now){
 const days=Math.min(90,Math.max(0,Number(db.preferences?.reminderDays??5)||0));
 const horizon=new Date(Date.parse(now+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
 return db.schedules.filter(s=>{
  if(s.status!=='open'||!s.dueOn||s.dueOn>horizon)return false;
  // After early termination, post-termination periods with prior receipts require manual reconciliation,
  // not an automated collection reminder to the former tenant.
  const lease=db.leases.find(l=>samePersistedId(l.id,s.leaseId));
  return !(lease?.status==='ended'&&lease.terminatedOn&&s.dueOn>lease.terminatedOn);
 })
 .map(s=>{const paid=paidFor(db,s.id),left=Math.max(0,s.amount-paid);const contacts=(db.reminderContacts||[]).filter(x=>samePersistedId(x.scheduleId,s.id));const lastContact=contacts.at(-1)||null;return {...s,paid,left,lastContact,contactCount:contacts.length}})
 .filter(s=>s.left>0).sort((a,b)=>a.dueOn.localeCompare(b.dueOn));
}

