/** Read-only projection for the executive workspace; never mutates bookkeeping state. */
import {bill,balance,periodTotals} from './finance.js';
import {sameDossierId} from './dossier-id.js';

export function daysUntil(isoDate,reference){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate||''))||!/^\d{4}-\d{2}-\d{2}$/.test(String(reference||'')))return null;
 const day=(v)=>Date.parse(v+'T00:00:00Z');
 const a=day(isoDate),b=day(reference);
 if(!Number.isFinite(a)||!Number.isFinite(b)||new Date(a).toISOString().slice(0,10)!==isoDate||new Date(b).toISOString().slice(0,10)!==reference)return null;
 return Math.round((a-b)/86400000);
}
export function getPortfolioOverview(data,period,reference,{includeFinancialTasks=true}={}){
 const units=(data.units||[]).filter(u=>u.status!=='archived');
 const projects=(data.projects||[]).filter(p=>p.status!=='archived');
 const leases=(data.leases||[]).filter(l=>l.status==='active');
 const bills=(data.schedules||[]).filter(s=>s.status==='open').map(s=>bill(data,s));
 const pending=bills.filter(s=>s.left>0&&s.dueOn);
 const dueSoon=pending.filter(s=>{const n=daysUntil(s.dueOn,reference);return n!==null&&n>=0&&n<=7});
 const overdue=pending.filter(s=>{const n=daysUntil(s.dueOn,reference);return n!==null&&n<0});
 const renewals=leases.filter(l=>l.endsOn).map(l=>({...l,days:daysUntil(l.endsOn,reference)})).filter(l=>l.days!==null&&l.days<=30).sort((a,b)=>a.days-b.days);
 const projectIndex=projects.map(p=>{
  const rows=units.filter(u=>sameDossierId(u.projectId,p.id));
  const occupied=rows.filter(u=>u.status==='occupied').length;
  return {id:p.id,name:p.name||'Dự án chưa đặt tên',count:rows.length,occupied,vacant:rows.filter(u=>u.status==='vacant').length,fillRate:rows.length?Math.round(occupied/rows.length*100):0};
 }).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'vi'));
 const totals=periodTotals(data,period);
 const tasks=[
   ...(includeFinancialTasks?overdue.map(s=>({key:'overdue-'+s.id,kind:'overdue',label:'Công nợ quá hạn',unitId:s.unitId,scheduleId:s.id,detail:s.period,amount:s.left,days:daysUntil(s.dueOn,reference)})):[]),
   ...renewals.map(l=>({key:'renew-'+l.id,kind:'renew',label:'Hợp đồng đến hạn',unitId:l.unitId,leaseId:l.id,detail:l.endsOn,amount:null,days:l.days})),
   ...(includeFinancialTasks?dueSoon.map(s=>({key:'due-'+s.id,kind:'due',label:'Sắp đến kỳ thu',unitId:s.unitId,scheduleId:s.id,detail:s.dueOn,amount:s.left,days:daysUntil(s.dueOn,reference)})):[])
 ].sort((a,b)=>(a.kind==='overdue'?0:a.kind==='renew'?1:2)-(b.kind==='overdue'?0:b.kind==='renew'?1:2)||a.days-b.days);
 const escrow=(data.leases||[]).filter(l=>l.status!=='archived').reduce((sum,l)=>sum+balance(data,l.id),0);
 return {
  totals, units:units.length,occupied:units.filter(u=>u.status==='occupied').length,vacant:units.filter(u=>u.status==='vacant').length,
  pending:pending.length,overdue,dueSoon,renewals,projectIndex,escrow,
  // Collection progress is a bounded UI indicator; raw amounts remain untouched.
  collectionRate:totals.due>0?Math.max(0,Math.min(100,Math.round(totals.paid/totals.due*100))):0,
  taskTotal:tasks.length,tasks:tasks.slice(0,7)
 };
}
