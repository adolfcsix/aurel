import {sameDossierId} from './dossier-id.js';
export const money=(v)=>v==null?'—':new Intl.NumberFormat('vi-VN').format(Math.round(v))+' ₫';
export const millions=(v)=>new Intl.NumberFormat('vi-VN',{maximumFractionDigits:1}).format(v/1e6)+' tr';
export const dmy=(value)=>value?new Date(value+'T12:00:00').toLocaleDateString('vi-VN'):'—';
export const isoToday=()=>{const t=new Date();const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(t);const o=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${o.year}-${o.month}-${o.day}`};
export const currentMonth=()=>isoToday().slice(0,7);
export const differenceDays=(date)=>date?Math.ceil((new Date(date+'T00:00:00Z')-new Date(isoToday()+'T00:00:00Z'))/86400000):null;
export const posted=(d,s)=>d.payments.filter(p=>sameDossierId(p.scheduleId,s.id)&&p.status==='posted').reduce((a,p)=>a+p.amount,0);
export const bill=(d,s)=>{const paid=posted(d,s),amount=Math.max(0,s.amount??0),base=s.feeBasis==='paid'?Math.min(amount,Math.max(0,paid)):amount;return {...s,paid,left:Math.max(0,amount-paid),fee:Math.round(base*(s.feePercent||0)/100)}};
export const balance=(d,leaseId)=>d.depositTransactions.filter(x=>sameDossierId(x.leaseId,leaseId)).reduce((s,x)=>s+(x.kind==='receive'?x.amount:-x.amount),0);
/** UI affordances mirror server eligibility, not authorization. A server-side
 * transaction still rechecks the lease, held balance and outstanding proposals. */
export const depositActions=(data,lease)=>{
 if(!lease)return {receive:false,propose:false};
 const pending=(data.depositSettlements||[]).some(row=>sameDossierId(row.leaseId,lease.id)&&['pending','approved'].includes(row.status));
 return {
  receive:!pending&&['active','draft'].includes(lease.status),
  propose:!pending&&lease.status==='ended'&&balance(data,lease.id)>0
 };
};
export const periodTotals=(d,period)=>d.schedules.filter(x=>x.period===period&&!['archived','historical','cancelled'].includes(x.status)).map(s=>bill(d,s)).reduce((a,s)=>({due:a.due+s.amount,paid:a.paid+s.paid,left:a.left+s.left,fee:a.fee+s.fee}),{due:0,paid:0,left:0,fee:0});
/** Match the backend reminderQueue semantics for the sidebar badge.
 * A schedule without dueOn is NOT an overdue reminder. Cancelled periods,
 * settled amounts and post-termination due dates are not actionable either. */
export const pendingReminderCount=(data,now=isoToday())=>{
 const lead=Math.min(90,Math.max(0,Number(data.preferences?.reminderDays??5)||0));
 const horizon=new Date(Date.parse(now+'T00:00:00Z')+lead*86400000).toISOString().slice(0,10);
 return (data.schedules||[]).filter(s=>{
  if(s.status!=='open'||!s.dueOn||s.dueOn>horizon)return false;
  const lease=(data.leases||[]).find(row=>sameDossierId(row.id,s.leaseId));
  if(lease?.status==='ended'&&lease.terminatedOn&&s.dueOn>lease.terminatedOn)return false;
  return bill(data,s).left>0;
 }).length;
};
/** Show the latest seven actual billing periods, ordered oldest-to-newest.
 * Taking .sort().slice(0,7) used to display the first seven historical periods. */
/** A "next payment" callout must have an actual due date and outstanding
 * money; blank dates and non-open periods must never be shown as the next due. */
export const nearestOutstandingSchedule=(data,schedules=[])=>schedules
 .filter(s=>s?.status==='open'&&/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s.dueOn||'')&&bill(data,s).left>0)
 .sort((a,b)=>a.dueOn.localeCompare(b.dueOn)||String(a.id).localeCompare(String(b.id)))[0]||null;
export const recentReportPeriods=(schedules=[],limit=7)=>[...new Set(schedules
 .filter(row=>!['archived','historical','cancelled'].includes(row.status)&&/^\d{4}-(0[1-9]|1[0-2])$/.test(row.period||''))
 .map(row=>row.period))].sort().slice(-limit);
export const rolePermissions={admin:['*'],manager:['project.write','building.write','unit.write','client.write','staff.write','lease.write','fee.write','payment.write','deposit.write','deposit.approve','report.read','audit.read','settings.write','reminder.write','reminder.refresh'],accountant:['payment.write','deposit.write','deposit.execute','fee.read','report.read','reminder.write','reminder.refresh'],staff:['lease.read','unit.read','client.read','reminder.write'],viewer:['lease.read','unit.read']};
export const allowed=(user,permission)=>!!user&&(rolePermissions[user.role]||[]).some(p=>p==='*'||p===permission);

/** Blank apartment fee inherits the configured company fee; explicit 0 means 0%. */
export const effectiveUnitFeePercent=(feePercent,preferences)=>{
 const raw=feePercent===null||feePercent===undefined||feePercent===''?preferences?.defaultFee??0:feePercent;
 const n=Number(raw);return Number.isFinite(n)&&n>=0&&n<=100?n:null;
};
