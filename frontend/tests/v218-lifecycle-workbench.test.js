import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {depositProposalStage,groupDepositProposals,proposalActions,proposalStatusText,leaseDaysRemaining,leaseStage,groupLeases} from '../src/lib/workflow-desk.js';

const actor={id:'manager-1'};
const perm=(s)=>['deposit.approve','deposit.execute'].includes(s);
const maker={id:'maker-1'};
const approved={id:'p-2',status:'approved',createdBy:'maker-1',approvedBy:'manager-1'};
test('V2.18: deposits have explicit approval, waiting for payment, and historical stages',()=>{
 const input=[{id:'1',status:'pending'},{id:'2',status:'approved'},{id:'3',status:'executed'},{id:'4',status:'rejected'},{id:'5',status:'unknown'}];
 const result=groupDepositProposals(input);
 assert.deepEqual(Object.keys(result),['pending','approved','history']);
 assert.equal(result.pending.length,1);assert.equal(result.approved.length,1);assert.equal(result.history.length,3);
 assert.equal(depositProposalStage(input[4]),'history');
 assert.match(proposalStatusText('approved'),/chờ chi/);
 assert.match(proposalStatusText('executed'),/Đã chi/);
});
test('V2.18: no approval or disbursement for original maker',()=>{
 assert.equal(proposalActions({status:'pending',createdBy:maker.id},maker,perm).approve,false);
 assert.equal(proposalActions(approved,maker,perm).execute,false);
});
test('V2.18: no disbursement for its approver, even with execute permission',()=>{
 assert.equal(proposalActions(approved,actor,perm).execute,false);
 assert.equal(proposalActions(approved,{id:'accountant-2'},perm).execute,true);
});
test('V2.18: permission-bound actions and immutable history',()=>{
 assert.deepEqual(proposalActions({status:'pending',createdBy:'another'},actor,()=>false),{approve:false,reject:false,execute:false});
 assert.deepEqual(proposalActions({status:'executed',createdBy:'another'},actor,perm),{approve:false,reject:false,execute:false});
 assert.deepEqual(proposalActions(null,actor,perm),{approve:false,reject:false,execute:false});
});
test('V2.18: calendar-day based lease classification near boundaries',()=>{
 assert.equal(leaseDaysRemaining('2026-12-11','2026-11-11'),30);
 assert.equal(leaseDaysRemaining('2026-11-11','2026-11-11'),0);
 assert.equal(leaseDaysRemaining('2026-11-10','2026-11-11'),-1);
 assert.equal(leaseDaysRemaining('invalid','2026-11-11'),null);
 assert.equal(leaseDaysRemaining('2026-02-30','2026-11-11'),null);
 assert.equal(leaseStage({status:'active',endsOn:'2026-12-11'},'2026-11-11'),'expiring');
 assert.equal(leaseStage({status:'active',endsOn:'2026-12-12'},'2026-11-11'),'active');
 assert.equal(leaseStage({status:'active',endsOn:'2026-11-10'},'2026-11-11'),'expired');
 assert.equal(leaseStage({status:'draft',endsOn:'2026-11-10'},'2026-11-11'),'draft');
 assert.equal(leaseStage({status:'ended',endsOn:'2026-12-11'},'2026-11-11'),'ended');
});
test('V2.18: contract desk builds priorities from state, not decorative counters',()=>{
 const grouped=groupLeases([{id:'a',status:'active',endsOn:'2026-11-20'},{id:'b',status:'draft'},{id:'c',status:'active',endsOn:'2026-11-08'}], '2026-11-11');
 assert.equal(grouped.draft.length,1);assert.equal(grouped.expired.length,1);assert.equal(grouped.expiring.length,1);
});
test('V2.18: real React screens mount both workbenches and a shared stylesheet',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 const approval=readFileSync(new URL('../src/components/ApprovalWorkbench.jsx',import.meta.url),'utf8');
 assert.match(app,/<ApprovalWorkbench proposals=\{data.depositSettlements\|\|\[\]\}/);
 assert.match(app,/<LeaseAttentionDesk leases=\{data.leases\}/);
 assert.match(app,/onExecute=\{p=>requestDecision\('execute',p\)\}/);
 assert.match(approval,/proposalActions\(item,user,can\)/);
 assert.match(approval,/role="tablist"/);
 assert.match(approval,/aria-selected=/);
 assert.match(main,/atelier-v218\.css/);
});
