/** Read-only operational view model used by editorial section mastheads.
 *  All monetary amounts are sourced from the existing ledger functions;
 *  no deposit value is ever included in rent or fee income.
 */
import {periodTotals,balance} from './finance.js';
import {daysUntil} from './overview.js';
import {sameDossierId} from './dossier-id.js';

export function getOperationsSnapshot(data,period,reference){
 const leases=(data.leases||[]).filter(l=>l.status!=='archived');
 const active=leases.filter(l=>l.status==='active');
 const expiring=active.filter(l=>{
  const days=daysUntil(l.endsOn,reference);
  return days!==null&&days>=0&&days<=30;
 });
 const units=(data.units||[]).filter(u=>u.status!=='archived');
 const totals=periodTotals(data,period);
 const held=leases.reduce((n,l)=>n+balance(data,l.id),0);
 const staff=(data.staff||[]).filter(s=>s.status!=='archived');
 const assigned=units.filter(u=>u.managerId&&staff.some(s=>sameDossierId(s.id,u.managerId)));
 const proposals=(data.depositSettlements||[]);
 return {
  leases:{total:leases.length,active:active.length,expiring:expiring.length},
  payments:{...totals,collectionRate:totals.due>0?Math.min(100,Math.round(totals.paid/totals.due*100)):0},
  fees:{fee:totals.fee,changes:(data.feeHistory||[]).length},
  deposits:{held,pending:proposals.filter(p=>p.status==='pending').length,executed:proposals.filter(p=>p.status==='executed').length},
  staff:{count:staff.length,assigned:assigned.length,units:units.length}
 };
}
