import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pendingReminderCount,pendingReminderItems,recentReportPeriods} from '../src/lib/finance.js';
import {reminderQueue} from '../../backend/src/domain.js';

const today='2026-11-12';
const makeState=()=>({
 preferences:{reminderDays:5},
 leases:[{id:'l1',status:'active'},{id:'l2',status:'ended',terminatedOn:'2026-11-10'}],
 schedules:[
  {id:'missing',leaseId:'l1',status:'open',amount:100},
  {id:'due',leaseId:'l1',status:'open',dueOn:'2026-11-12',amount:1000},
  {id:'soon',leaseId:'l1',status:'open',dueOn:'2026-11-17',amount:1000},
  {id:'future',leaseId:'l1',status:'open',dueOn:'2026-11-18',amount:1000},
  {id:'cancelled',leaseId:'l1',status:'cancelled',dueOn:'2026-11-11',amount:1000},
  {id:'ended',leaseId:'l2',status:'open',dueOn:'2026-11-14',amount:1000},
  {id:'overdue',leaseId:'l1',status:'open',dueOn:'2026-11-01',amount:1000}
 ],
 payments:[{id:'p1',scheduleId:'due',status:'posted',amount:600},{id:'p2',scheduleId:'soon',status:'posted',amount:1000}],
 depositTransactions:[]
});

test('V2.70: reminder badge ignores missing due date and exactly matches backend unpaid reminder count',()=>{
 const data=makeState();
 const queue=reminderQueue(data,today);
 assert.deepEqual(queue.map(row=>row.id),['overdue','due']);
 assert.deepEqual(pendingReminderItems(data,today).map(({id,left})=>({id,left})),queue.map(({id,left})=>({id,left})));
 assert.equal(pendingReminderCount(data,today),queue.length);
 assert.equal(pendingReminderCount({...data,schedules:[data.schedules[0]]},today),0);
});
test('V2.70: reminder badge adjusts to partial payments, cancelled periods and revoked late schedules',()=>{
 const data=makeState();
 data.payments.push({id:'p3',scheduleId:'overdue',amount:1000,status:'posted'});
 assert.equal(pendingReminderCount(data,today),1);
 data.schedules.find(x=>x.id==='due').status='cancelled';
 assert.equal(pendingReminderCount(data,today),0);
 assert.equal(pendingReminderCount(data,today),reminderQueue(data,today).length);
});
test('V2.70: reminder badge follows configured lead days and capped backend horizon',()=>{
 const data=makeState();
 data.preferences.reminderDays=0;
 assert.equal(pendingReminderCount(data,today),reminderQueue(data,today).length);
 data.preferences.reminderDays=1000;
 assert.equal(pendingReminderCount(data,today),reminderQueue(data,today).length);
});
test('V2.70: chart selects the seven newest valid periods in ascending time order across years',()=>{
 const schedules=Array.from({length:15},(_,i)=>({status:'open',period:`${2025+Math.floor((i+4)/12)}-${String((i+4)%12+1).padStart(2,'0')}`}));
 const expected=schedules.slice(-7).map(row=>row.period);
 schedules.push({period:'2027-01',status:'cancelled'},{period:'invalid',status:'open'},schedules[10]);
 assert.deepEqual(recentReportPeriods(schedules),expected);
});
test('V2.70: chart excludes cancelled and historical periods, and gracefully handles empty history',()=>{
 assert.deepEqual(recentReportPeriods([]),[]);
 assert.deepEqual(recentReportPeriods([
  {period:'2026-07',status:'historical'},{period:'2026-10',status:'open'},
  {period:'2026-11',status:'cancelled'},{period:'2026-10',status:'open'}
 ]),['2026-10']);
});
test('V2.70: React sidebar and reports use shared tested helpers, not duplicate display calculations',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(app,/const count=pendingReminderCount\(data\)/);
 assert.match(app,/const months=recentReportPeriods\(data.schedules\)/);
 assert.doesNotMatch(app,/\.sort\(\)\.slice\(0,7\)/);
});
test('V2.70: disposable HTTP smoke and live React script explicitly cover ownership escalation and revocation',()=>{
 const smoke=readFileSync(new URL('../../scripts/smoke.mjs',import.meta.url),'utf8');
 const browser=readFileSync(new URL('../../scripts/qa-react-browser.mjs',import.meta.url),'utf8');
 for(const needle of ['/me/owned-units','/me/owned-unit-change-requests','/owner-clients/','/auth/logout']){
  assert.ok(smoke.includes(needle),'HTTP smoke missing '+needle);
  assert.ok(browser.includes(needle),'React browser journey missing '+needle);
 }
 assert.match(smoke,/Stale approval must not overwrite apartment/);
 assert.match(smoke,/\/auth\/register/);
 assert.match(browser,/aurel-owner-correction-inbox/); // Manager approves through rendered React inbox.
 assert.match(browser,/Registration switch is missing/); // Browser signs up through the rendered React form, not direct fetch.
 assert.match(browser,/owner React|live owner React|PASS live owner React/);
});
