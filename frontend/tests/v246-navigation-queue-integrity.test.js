import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canNavigate,buildQuickFindIndex,findQuickResults} from '../src/lib/quick-find.js';
import {getPortfolioOverview} from '../src/lib/overview.js';

const minimal=()=>({
 projects:[{id:7,name:'Dự án Bảy'},{id:'07',name:'Dự án Không Bảy'}],
 units:[{id:20,projectId:'7',code:'M-20',owner:'Tên riêng tư'},{id:'021',projectId:'07',code:'M-21'}],
 leases:[{id:30,unitId:'20',tenantName:'Đặng Lan',status:'active',endsOn:'2026-12-01'},
  {id:31,unitId:21,tenantName:'Không thuộc căn 021',status:'draft'}],
 schedules:[],payments:[],depositTransactions:[],clients:[]
});

test('V2.46 quick-find joins mixed-type IDs without conflating leading zero IDs',()=>{
 const idx=buildQuickFindIndex(minimal(),{role:'manager'},[]);
 const unit=findQuickResults(idx,'m-20')[0];
 assert.match(unit.detail,/Dự án Bảy/);
 assert.doesNotMatch(unit.detail,/Không Bảy/);
 const second=findQuickResults(idx,'m-21')[0];
 assert.match(second.detail,/Dự án Không Bảy/);
 const lease=findQuickResults(idx,'hợp đồng m-20')[0];
 assert.equal(lease.kind,'lease');
 assert.equal(findQuickResults(idx,'hợp đồng m-21').length,0,'id 21 cannot match 021');
});

test('V2.46 search still cannot index private client names for viewer',()=>{
 const idx=buildQuickFindIndex(minimal(),{role:'viewer'},[]);
 assert.deepEqual(findQuickResults(idx,'tên riêng tư'),[]);
 assert.deepEqual(findQuickResults(idx,'đặng lan'),[]);
 assert.equal(findQuickResults(idx,'m-20')[0].kind,'unit');
});

test('V2.46 navigation preserves staff payment follow-up but hides unauthorized client and finance screens',()=>{
 const staff={role:'staff'},accountant={role:'accountant'},manager={role:'manager'},viewer={role:'viewer'};
 assert.equal(canNavigate(staff,'payments'),true);
 assert.equal(canNavigate(accountant,'clients'),false);
 assert.equal(canNavigate(staff,'clients'),true);
 for(const section of ['fees','deposits','reports']){
  assert.equal(canNavigate(staff,section),false,`staff must not open ${section}`);
  assert.equal(canNavigate(viewer,section),false);
  assert.equal(canNavigate(manager,section),true);
  assert.equal(canNavigate(accountant,section),true);
 }
 assert.equal(canNavigate(staff,'reminders'),true);
 assert.equal(canNavigate(viewer,'reminders'),false);
 assert.equal(canNavigate(manager,'quality'),true);
 assert.equal(canNavigate({role:'unknown'},'dashboard'),false);
 assert.equal(canNavigate({role:'unknown'},'clients'),false);
});

test('V2.46 dashboard counts full queue even when only 7 priority cards render',()=>{
 const data=minimal();
 data.leases=Array.from({length:10},(_,i)=>({id:i+1,unitId:20,status:'active',endsOn:`2026-11-${String(i+12).padStart(2,'0')}`}));
 const overview=getPortfolioOverview(data,'2026-11','2026-11-12');
 assert.equal(overview.taskTotal,10);
 assert.equal(overview.tasks.length,7);
 assert.equal(overview.renewals.length,10);
 assert.equal(overview.tasks[0].days,0);
});

test('V2.46 restricted dashboard excludes monetary task cards without altering financial totals',()=>{
 const data=minimal();
 data.leases=[{id:1,unitId:20,status:'active',endsOn:'2026-11-25'}];
 data.schedules=[{id:1,unitId:20,status:'open',dueOn:'2026-11-11',period:'2026-11',amount:4000000},
  {id:2,unitId:20,status:'open',dueOn:'2026-11-15',period:'2026-11',amount:5000000}];
 const full=getPortfolioOverview(data,'2026-11','2026-11-12');
 const restricted=getPortfolioOverview(data,'2026-11','2026-11-12',{includeFinancialTasks:false});
 assert.equal(full.taskTotal,3);
 assert.equal(restricted.taskTotal,1);
 assert.equal(restricted.tasks.every(t=>t.kind==='renew'&&t.amount===null),true);
 assert.deepEqual(restricted.totals,full.totals,'reporting values never modified by display permissions');
});

test('V2.46 dashboard contract uses role-specific work navigation and no hardcoded year',()=>{
 const src=readFileSync(new URL('../src/components/ExecutiveOverview.jsx',import.meta.url),'utf8');
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(src,/includeFinancialTasks:showFinancial/);
 assert.match(src,/workDestination=showFinancial\?'reminders':'leases'/);
 assert.match(src,/\{state\.taskTotal\}/);
 assert.match(src,/date\?\.slice\(0,4\)/);
 assert.doesNotMatch(src,/AUREL · 2026/);
 assert.match(app,/if\(!canNavigate\(auth,to\)\)return/);
 assert.match(app,/if\(auth&&!canNavigate\(auth,page\)\)setPage\('dashboard'\)/);
});
