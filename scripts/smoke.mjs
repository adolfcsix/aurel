import {disposablePgTarget} from './pg-test-config.mjs';
import {APP_VERSION} from '../backend/src/runtime-version.js';
/**
 * HTTP smoke: JSON mode uses disposable temp data.
 * PostgreSQL mode requires an EMPTY disposable database ending in _test and an explicit acknowledgement.
 * PostgreSQL smoke leaves its test records intact for inspection; NEVER run against production.
 */
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dataDir=await mkdtemp(path.join(tmpdir(),'aurel-smoke-'));
const password='Aurel-Standalone-QA-Only-2026';
const pgMode=process.argv.includes('--postgres');
const testDbUrl=process.env.AUREL_PG_TEST_DATABASE_URL||'';
const todayVietnam=()=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`};
async function verifyDisposablePg(){
 const {name:database}=disposablePgTarget(process.env);
 const {Pool}=await import('pg');const pool=new Pool({connectionString:testDbUrl,max:1,connectionTimeoutMillis:5000});
 try{const info=await pool.query('SELECT current_database() AS name');if(info.rows[0]?.name!==database)throw Error('Database identity does not match the dedicated test URL');
  for(const table of ['app_users','app_sessions','projects','buildings','floors','rooms','staff','clients','units','leases','payment_schedules','payments','deposit_transactions','deposit_settlements','fee_history','reminder_contacts','reminder_notifications','payment_attachments','audit_logs','app_settings']){const count=await pool.query(`SELECT COUNT(*)::int AS n FROM ${table}`);if(count.rows[0].n!==0)throw Error(`Disposable database is not empty: ${table}`);}
 }finally{await pool.end()}
}
let child=null,log='';

async function freePort(){
 const s=net.createServer();await new Promise((resolve,reject)=>s.once('error',reject).listen(0,'127.0.0.1',resolve));
 const port=s.address().port;await new Promise(resolve=>s.close(resolve));return port;
}
async function waitForHealth(base,child){
 for(let i=0;i<60;i++){
  if(child.exitCode!=null)throw Error('Backend stopped early: '+log.slice(-700));
  try{const r=await fetch(base+'/api/health');if(r.ok)return r.json()}catch{}
  await delay(150);
 }
 throw Error('Backend unavailable: '+log.slice(-700));
}
const check=(x,message)=>assert.ok(x,message);
async function runner(){
 if(pgMode)await verifyDisposablePg();
 const port=await freePort(),base=`http://127.0.0.1:${port}`;
 child=spawn(process.execPath,['backend/src/index.js'],{cwd:root,env:{...process.env,
  PORT:String(port),AUREL_STORAGE:pgMode?'postgres':'json',DATABASE_URL:pgMode?testDbUrl:'',AUREL_DEMO_DATA_DIR:dataDir,
  DEMO_ADMIN_PASSWORD:password,ADMIN_INITIAL_PASSWORD:pgMode?password:'',ADMIN_USERNAME:'admin',NODE_ENV:'development'},stdio:['ignore','pipe','pipe']});
 for(const stream of [child.stdout,child.stderr])stream.on('data',buf=>{log=(log+buf.toString()).slice(-3500)});
 const health=await waitForHealth(base,child);assert.equal(health.version,APP_VERSION,'API version must match package.json');assert.equal(health.storage,pgMode?'postgres':'json-demo');
 const ready=await fetch(base+'/api/ready');assert.equal(ready.status,200,'Database readiness must succeed before business smoke');assert.equal((await ready.json()).ready,true);
 let cookie='',csrf='';
 async function request(method,route,body,expected=method==='POST'?201:200,auth=true){
  const headers={...(body!==undefined?{'Content-Type':'application/json'}:{}),...(auth?{Cookie:cookie,'X-CSRF-Token':csrf}:{})};
  const res=await fetch(base+'/api'+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  if(!res.headers.get('cache-control')?.includes('no-store'))throw Error(`${method} ${route}: private API response was cacheable`);
  const parsed=await res.json().catch(()=>({}));
  if(res.status!==expected)throw Error(`${method} ${route}: expected ${expected}, got ${res.status}: ${JSON.stringify(parsed)}`);
  return {res,data:parsed};
 }
 async function login(username,pwd){
  const {res,data}=await request('POST','/auth/login',{username,password:pwd},200,false);
  cookie=(res.headers.get('set-cookie')||'').split(';')[0];csrf=data.csrf;
  check(cookie.startsWith('aurel_session='),'No session cookie');return data;
 }
 await login('admin',password);
 const project=(await request('POST','/projects',{name:'Smoke Test Estate'})).data;
 const building=(await request('POST','/buildings',{projectId:project.id,code:'T1',name:'Tower 1'})).data;
 const floor=(await request('POST','/floors',{buildingId:building.id,code:'10',name:'Tầng 10'})).data;
 const room=(await request('POST','/rooms',{floorId:floor.id,code:'1001',name:'Phòng 1001'})).data;
 // Signed preview is mandatory even for a user with import rights.
 const importCsv='Mã căn,Dự án,Tòa nhà\nSMOKE-IMPORT-1,Smoke Test Estate,T1';
 const inspected=(await request('POST','/import/units/preview',{csv:importCsv},200)).data;
 check(inspected.previewToken&&inspected.digest,'Import preview must return a signed confirmation token');
 await request('POST','/import/units/commit',{csv:importCsv,digest:inspected.digest},409);
 const imported=(await request('POST','/import/units/commit',{csv:importCsv,digest:inspected.digest,previewToken:inspected.previewToken})).data;
 assert.equal(imported.imported,1,'Preview-confirmed import must create one unit');
 // XLSX is an optional utility, not part of the boss's web-field requirement.
 // Exercise binary upload only when explicitly requested with --xlsx.
 if(process.argv.includes('--xlsx')){
 // Direct XLSX workflow: generate a small workbook and exercise the actual binary API.
 const {default:ExcelJS}=await import('exceljs');
 const workbook=new ExcelJS.Workbook();
 workbook.addWorksheet('Hướng dẫn').addRow(['Chọn trang Căn hộ']);
 const worksheet=workbook.addWorksheet('Căn hộ');
 worksheet.addRow(['Mã căn','Dự án','Tòa nhà','Giá thuê','Nội thất']);
 worksheet.addRow(['SMOKE-XLSX-1','Smoke Test Estate','T1',9500000,'Đầy đủ']);
 const xlsxBytes=Buffer.from(await workbook.xlsx.writeBuffer());
 const xlsxHeaders={'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'X-CSRF-Token':csrf,Cookie:cookie,'X-Aurel-Sheet-Encoded':encodeURIComponent('Căn hộ'),
  'X-Aurel-Mapping':JSON.stringify({code:0,project:1,building:2,rent:3,interior:4})};
 async function xlsxRequest(endpoint,headers,expected){
  const response=await fetch(base+'/api/import/units/xlsx/'+endpoint,{method:'POST',headers,body:xlsxBytes});
  const json=await response.json().catch(()=>({}));
  if(response.status!==expected)throw Error(`XLSX ${endpoint}: expected ${expected}, got ${response.status}: ${JSON.stringify(json)}`);
  return json;
 }
 const xlsxInspection=await xlsxRequest('inspect',xlsxHeaders,200);
 assert.equal(xlsxInspection.selected,'Căn hộ');
 await xlsxRequest('sheet',{...xlsxHeaders,'X-Aurel-Sheet-Encoded':'%ZZ'},400);
 const selectedSheet=await xlsxRequest('sheet',xlsxHeaders,200);
 assert.equal(selectedSheet.headers[0],'Mã căn');
 const xlsxPreview=await xlsxRequest('preview',xlsxHeaders,200);
 check(xlsxPreview.previewToken&&xlsxPreview.digest,'XLSX preview must return signed confirmation');
 await xlsxRequest('commit',{...xlsxHeaders,'X-Aurel-Digest':xlsxPreview.digest},409);
 const xlsxImported=await xlsxRequest('commit',{...xlsxHeaders,
  'X-Aurel-Digest':xlsxPreview.digest,'X-Aurel-Preview-Token':xlsxPreview.previewToken},201);
 assert.equal(xlsxImported.imported,1,'XLSX import must create the expected unit');
 }
 const owner=(await request('POST','/clients',{name:'Smoke Owner',type:'owner',phone:'PRIVATE_OWNER_PHONE_263'})).data;
 const tenant=(await request('POST','/clients',{name:'Smoke Tenant',type:'tenant',phone:'PRIVATE_TENANT_PHONE_263',email:'private-tenant-263@example.test'})).data;
 const assignedStaff=(await request('POST','/staff',{name:'QA Assigned Staff',phone:'PRIVATE_STAFF_PHONE_263'})).data;
 await request('POST','/units',{code:'INVALID-OWNER',projectId:project.id,ownerId:tenant.id,status:'draft'},409);
 const unit=(await request('POST','/units',{code:'T1-1001',projectId:project.id,buildingId:building.id,roomId:room.id,interiorStatus:'partial',interiorNotes:'Có bàn và ghế',ownerId:owner.id,tenantId:tenant.id,managerId:assignedStaff.id,status:'draft'})).data;
 await request('PATCH',`/clients/${owner.id}`,{type:'tenant',expectedRevision:owner.revision},409);
 const revisedOwner=(await request('PATCH',`/clients/${owner.id}`,{name:'Smoke Owner Updated',expectedRevision:owner.revision},200)).data;
 assert.equal(revisedOwner.revision,owner.revision+1,'Client edit must increment revision');
 await request('PATCH',`/clients/${owner.id}`,{name:'Concurrent stale edit',expectedRevision:owner.revision},409);
 await request('PATCH',`/clients/${owner.id}`,{name:'Missing revision'},428);
 const ownerReloaded=(await request('GET','/state',undefined,200)).data.clients.find(c=>c.id===owner.id);
 assert.equal(ownerReloaded.name,'Smoke Owner Updated','Client save/reopen lost the new name');
 check(unit.rent==null,'Draft must accept missing rent');
 await request('DELETE',`/rooms/${room.id}`,undefined,409);
 const bulkRequest={ids:[unit.id],changes:{interiorStatus:'furnished',interiorNotes:'Sofa và bàn ăn'}};
 const bulkPreview=(await request('POST','/units/bulk/preview',bulkRequest,200)).data;
 check(bulkPreview.rows[0].changedFields.includes('interiorStatus'),'Bulk preview missing interior status');
 const bulkResult=(await request('POST','/units/bulk/commit',{...bulkRequest,fingerprint:bulkPreview.fingerprint},200)).data;
 assert.equal(bulkResult.updated,1);
 const nested=(await request('GET','/state',undefined,200)).data;
 check(nested.floors.some(f=>f.id===floor.id)&&nested.rooms.some(r=>r.id===room.id),'Spatial records missing from API state');
 const currentUnit=(await request('GET','/state',undefined,200)).data.units.find(x=>x.id===unit.id);
 await request('PATCH',`/units/${unit.id}`,{expectedRevision:currentUnit.revision??0,feePercent:3.7,feeBasis:'due',feeEffectiveFrom:todayVietnam(),feeReason:'Smoke test fee update'});
 await request('PATCH',`/units/${unit.id}`,{expectedRevision:currentUnit.revision??0,notes:'Stale write must fail'},409);
 await request('PATCH',`/units/${unit.id}`,{notes:'Missing revision must fail'},428);
 // Clearing the per-apartment percentage must inherit the company fee (6%), not silently turn into 0%.
 const afterFirst=(await request('GET','/state',undefined,200)).data.units.find(u=>u.id===unit.id);
 await request('PATCH',`/units/${unit.id}`,{expectedRevision:afterFirst.revision,feePercent:null,feeEffectiveFrom:todayVietnam(),feeReason:'Reset to company default'});
 const inherited=(await request('GET','/state',undefined,200)).data;
 check(inherited.feeHistory.some(h=>h.unitId===unit.id&&h.inheritedDefault&&h.percent===6),'Cleared fee must inherit 6%');
 const afterClear=inherited.units.find(u=>u.id===unit.id);
 await request('PATCH',`/units/${unit.id}`,{expectedRevision:afterClear.revision,feePercent:3.7,feeEffectiveFrom:todayVietnam(),feeReason:'Restore apartment policy'});
 const year=Number(todayVietnam().slice(0,4)),nextYear=year+1;
 const lease=(await request('POST','/leases',{unitId:unit.id,tenantName:'QA Customer',startsOn:`${year}-01-01`,endsOn:`${nextYear}-03-31`,rent:10000000,paymentDay:31,status:'active'})).data;
 const updatedLease=(await request('PATCH',`/leases/${lease.id}`,{notes:'Lease checked and reopened',expectedRevision:lease.revision},200)).data;
 assert.equal(updatedLease.revision,lease.revision+1,'Lease edit must increment revision');
 await request('PATCH',`/leases/${lease.id}`,{notes:'Stale overwrite',expectedRevision:lease.revision},409);
 await request('PATCH',`/leases/${lease.id}`,{notes:'Missing revision'},428);
 const state=(await request('GET','/state',undefined,200)).data;
 assert.equal(state.leases.find(l=>l.id===lease.id)?.notes,'Lease checked and reopened','Lease save/reopen failed');
 assert.ok(state.units.find(u=>u.id===unit.id)?.revision>afterClear.revision,'Lease activation must invalidate stale unit editors');
 const schedule=state.schedules.find(s=>s.leaseId===lease.id&&s.period===`${nextYear}-01`);
 check(schedule&&schedule.dueOn===`${nextYear}-01-31`,'Schedule generation failed');
 assert.equal(state.schedules.find(s=>s.leaseId===lease.id&&s.period===`${nextYear}-02`)?.dueOn,`${nextYear}-02-${new Date(Date.UTC(nextYear,2,0)).getUTCDate()}`);
 const depositReceipt=(await request('POST',`/deposits/${lease.id}/receive`,{amount:20000000,note:'Smoke test received deposit',idempotencyKey:'smoke-receive-1'})).data;
 check(depositReceipt.amount===20000000,'Deposit receive failed');
 const key='smoke-unique-payment-1';
 const payment=(await request('POST','/payments',{scheduleId:schedule.id,amount:4000000,date:todayVietnam(),idempotencyKey:key})).data;
 const repeat=(await request('POST','/payments',{scheduleId:schedule.id,amount:4000000,date:payment.date,idempotencyKey:key})).data;
 assert.equal(payment.id,repeat.id,'Payment idempotency broken');
 // A partially paid period cannot be over-collected, but its exact balance can
 // be paid in a separate receipt; both receipts must survive the later closure.
 await request('POST','/payments',{scheduleId:schedule.id,amount:7000000,date:todayVietnam(),idempotencyKey:'smoke-overpay-rejected'},400);
 const finalPayment=(await request('POST','/payments',{scheduleId:schedule.id,amount:6000000,date:todayVietnam(),idempotencyKey:'smoke-balance-payment'})).data;
 check(finalPayment.amount===6000000,'Remaining balance payment failed');
 const completedSchedule=(await request('GET','/state',undefined,200)).data;
 assert.equal(completedSchedule.payments.filter(p=>p.scheduleId===schedule.id&&p.status==='posted').reduce((sum,p)=>sum+p.amount,0),10000000,'Partial receipts must exactly settle the period');
 await request('POST','/payments',{scheduleId:schedule.id,amount:1,date:todayVietnam(),idempotencyKey:'smoke-overpay-after-settlement'},400);
 await request('DELETE',`/units/${unit.id}`,undefined,400);
 const endDate=todayVietnam();
 const closurePreview=(await request('POST',`/leases/${lease.id}/close-preview`,{effectiveOn:endDate},200)).data;
 check(closurePreview.cancelledCount>0,'Closing did not detect future untouched schedules');
 const closed=(await request('POST',`/leases/${lease.id}/close`,{effectiveOn:endDate,reason:'Đóng hợp đồng trong bài kiểm tra',fingerprint:closurePreview.fingerprint},200)).data;
 assert.equal(closed.status,'ended');
 // Maker (admin) != checker (manager) != payer (accountant).
 const managerPassword='ManagerPass-2026-Only',accountantPassword='AccountantPass-2026-Only';
 await request('POST','/auth/users',{username:'managerqa',name:'QA Manager',password:managerPassword,role:'manager'});
 await request('POST','/auth/users',{username:'accountantqa',name:'QA Accountant',password:accountantPassword,role:'accountant'});
 await request('POST','/auth/users',{username:'staffqa',name:'QA Assigned Staff',password:'StaffPass-2026-Only',role:'staff',staffId:assignedStaff.id});
 const proposalInput={refund:18000000,deduction:2000000,note:'Đối trừ hợp lệ trong kiểm thử',idempotencyKey:'smoke-proposal-1'};
 const proposal=(await request('POST',`/deposits/${lease.id}/proposals`,proposalInput)).data;
 const proposalRetry=(await request('POST',`/deposits/${lease.id}/proposals`,proposalInput)).data;
 assert.equal(proposalRetry.id,proposal.id,'Repeated deposit proposal must not create another record');
 await request('POST',`/deposits/${lease.id}/proposals`,{...proposalInput,note:'Thay đổi căn cứ đối trừ'},409);
 await request('POST',`/deposit-proposals/${proposal.id}/approve`,{},403);
 await login('managerqa',managerPassword);
 const managerState=(await request('GET','/state',undefined,200)).data;
 check(managerState.clients.some(c=>c.id===tenant.id&&c.phone==='PRIVATE_TENANT_PHONE_263'),'Manager must retain authorized client access');
 const approved=(await request('POST',`/deposit-proposals/${proposal.id}/approve`,{},200)).data;
 assert.equal(approved.status,'approved','Independent manager must approve deposit');
 await login('accountantqa',accountantPassword);
 const accountingState=(await request('GET','/state',undefined,200)).data;
 check(accountingState.clients.length===0,'Accountant must not receive the client directory');
 const accountingJson=JSON.stringify(accountingState);
 for(const secret of ['PRIVATE_OWNER_PHONE_263','PRIVATE_TENANT_PHONE_263','private-tenant-263@example.test','PRIVATE_STAFF_PHONE_263','Smoke Tenant']){
  check(!accountingJson.includes(secret),'Accountant state leaked contact data');
 }
 check(accountingState.schedules.some(s=>s.id===schedule.id&&s.amount===10000000),'Accountant lost billing schedule');
 check(accountingState.payments.some(p=>p.id===payment.id&&p.amount===4000000),'Accountant lost receipt ledger');
 await request('POST','/clients',{name:'Accountant must be denied',type:'owner'},403);
 const accountingReminders=(await request('GET','/reminders',undefined,200)).data;
 check(!JSON.stringify(accountingReminders).includes('PRIVATE_TENANT_PHONE_263'),'Accountant reminder queue leaked contact data');
 const confirmation={reference:'SMOKE-TRANSFER-REF-1'};
 const refund=(await request('POST',`/deposit-proposals/${proposal.id}/execute`,confirmation,200)).data;
 const refundRetry=(await request('POST',`/deposit-proposals/${proposal.id}/execute`,confirmation,200)).data;
 assert.equal(refund.id,refundRetry.id,'Deposit execution must be idempotent');
 await request('POST',`/deposit-proposals/${proposal.id}/execute`,{reference:'DIFFERENT-TRANSFER'},409);
 await login('admin',password);
 const afterRefund=(await request('GET','/state',undefined,200)).data;
 assert.equal(afterRefund.depositTransactions.filter(t=>t.proposalId===proposal.id).length,1,'Deposit payout must be unique');

 await request('DELETE',`/units/${unit.id}`,undefined,200);
 const archive=(await request('GET','/archives',undefined,200)).data;
 check(archive.some(x=>x.id===unit.id),'Archived unit not visible');
 await request('POST',`/archives/units/${unit.id}/restore`,undefined,200);
 const restored=(await request('GET','/state',undefined,200)).data;
 check(restored.units.some(u=>u.id===unit.id&&u.feePercent===3.7),'Restore lost percentage');
 check(restored.payments.some(p=>p.id===payment.id),'Restore removed finance history');

 // A changed company default must apply only to inherited policies, never to
 // explicitly configured units or already-issued periods with receipts.
 const companyChanged=(await request('PATCH','/preferences',{
  defaultFee:5,defaultFeeReason:'Smoke: thay đổi chính sách mặc định'},200)).data;
 assert.equal(companyChanged.defaultFee,5);
 const stateWithNewDefault=(await request('GET','/state',undefined,200)).data;
 const importedUnit=stateWithNewDefault.units.find(u=>u.code==='SMOKE-IMPORT-1');
 check(Boolean(importedUnit),'Imported draft missing after company fee update');
 check(stateWithNewDefault.feeHistory.some(h=>h.unitId===importedUnit.id&&h.inheritedDefault&&h.percent===5),
  'New company default did not reach inherited apartment policy');
 check(stateWithNewDefault.units.find(u=>u.id===unit.id).feePercent===3.7,
  'Company default must not replace an apartment-specific override');
 check(stateWithNewDefault.schedules.find(s=>s.id===schedule.id).feePercent===3.7,
  'Already-issued schedule must preserve its own percentage');

 await login('staffqa','StaffPass-2026-Only');
 const staffState=(await request('GET','/state',undefined,200)).data;
 check(staffState.units.some(u=>u.id===unit.id),'Assigned staff must see assigned unit');
 check(!staffState.units.some(u=>u.code==='SMOKE-IMPORT-1'),'Staff must not see unassigned portfolio');
 check(staffState.clients.some(c=>c.id===tenant.id&&c.phone==='PRIVATE_TENANT_PHONE_263'),'Assigned staff must see linked client');
 await request('POST','/clients',{name:'Staff must be denied',type:'owner'},403);
 await login('admin',password);
 const viewer=(await request('POST','/auth/users',{username:'viewerqa',name:'QA Viewer',password:'ViewerPass-2026-Only',role:'viewer'})).data;
 assert.equal(viewer.role,'viewer');
 await login('viewerqa','ViewerPass-2026-Only');
 const view=(await request('GET','/state',undefined,200)).data;
 check(view.payments.length===0&&view.clients.length===0,'Viewer sees restricted records');
 const visibleUnit=view.units.find(u=>u.id===unit.id);
 check(visibleUnit&&visibleUnit.rent===null&&visibleUnit.depositReturned===null&&visibleUnit.feePercent===null,'Viewer sees a restricted financial field');
 check(view.preferences.defaultFee===null&&view.depositSettlements.length===0,'Viewer sees private fee policy or deposit workflow');
 await request('POST',`/archives/units/${unit.id}/restore`,undefined,403);
 // V2.70 acceptance: the complete owner journey must work through real HTTP,
 // not only through direct domain-function tests or source-code assertions.
 // Everything here runs against the disposable database used by this smoke.
 const ownerPassword='OwnerJourney-2026-Secret!';
 await request('POST','/auth/register',{
  username:'ownerjourney',name:'Owner Journey',password:ownerPassword,role:'admin'
 },400,false); // Client-supplied role escalation must fail.
 const registration=await request('POST','/auth/register',{
  username:'ownerjourney',name:'Owner Journey',password:ownerPassword
 },201,false);
 const registeredUser=registration.data.user;
 assert.equal(registeredUser.role,'viewer','Self-registration must never grant elevated role');
 assert.equal(registeredUser.status,'active','Registration must not be pending admin approval');
 assert.ok(registration.data.csrf,'Registration must issue a usable session CSRF token');
 assert.match(registration.res.headers.get('set-cookie')||'',/HttpOnly/i,'Session cookie must be HttpOnly');
 assert.match(registration.res.headers.get('set-cookie')||'',/SameSite=Lax/i,'Session must use SameSite protection');
 cookie=(registration.res.headers.get('set-cookie')||'').split(';')[0];csrf=registration.data.csrf;
 const ownerSession=(await request('GET','/auth/me',undefined,200)).data;
 assert.equal(ownerSession.user.id,registeredUser.id,'New account must be logged in without a second login');
 assert.deepEqual((await request('GET','/me/owned-units',undefined,200)).data,[],'Unverified owner must have no private units');
 await request('POST',`/me/owned-units/${unit.id}/change-requests`,{field:'area',value:73.5,reason:'Before verification'},403);
 await request('PUT',`/auth/users/${registeredUser.id}/owner-clients/${owner.id}`,{},403);
 await request('GET','/owner-change-requests',undefined,403);
 await request('PATCH',`/units/${unit.id}`,{area:99},403);
 // An authenticated owner cannot bypass CSRF to submit a proposal.
 const noCsrf=await fetch(base+`/api/me/owned-units/${unit.id}/change-requests`,{
  method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},
  body:JSON.stringify({field:'area',value:73.5,reason:'Missing CSRF'})
 });
 assert.equal(noCsrf.status,403,'Owner proposal without CSRF must be forbidden');
 await login('admin',password);
 await request('PUT',`/auth/users/${registeredUser.id}/owner-clients/${owner.id}`,{},200);
 await login('ownerjourney',ownerPassword);
 const owned=(await request('GET','/me/owned-units',undefined,200)).data;
 assert.equal(owned.length,1,'Verified owner must see only the linked apartment');
 assert.equal(owned[0].id,unit.id);
 for(const sensitive of ['rent','feePercent','deposit','tenantId','ownerId','interiorNotes']){
  assert.equal(Object.hasOwn(owned[0],sensitive),false,`Owner payload leaked ${sensitive}`);
 }
 await request('PUT',`/me/owned-units/${unit.id}/note`,{note:'Owner-only inspection note'},200);
 assert.equal((await request('GET','/me/owned-units',undefined,200)).data[0].personalNote,'Owner-only inspection note');
 await request('POST',`/me/owned-units/${unit.id}/change-requests`,{field:'rent',value:1,reason:'Forbidden finance'},403);
 const firstRequest=(await request('POST',`/me/owned-units/${unit.id}/change-requests`,{
  field:'area',value:73.5,reason:'Owner measured the apartment again'
 })).data;
 assert.equal(firstRequest.status,'pending');
 await request('POST',`/me/owned-units/${unit.id}/change-requests`,{field:'address',value:'Another request',reason:'Duplicate pending'},409);
 await request('POST',`/owner-change-requests/${firstRequest.id}/approve`,{},403);
 assert.equal((await request('GET','/me/owned-unit-change-requests',undefined,200)).data[0].id,firstRequest.id);
 await login('managerqa',managerPassword);
 const inbox=(await request('GET','/owner-change-requests',undefined,200)).data;
 assert.ok(inbox.some(r=>r.id===firstRequest.id),'Manager did not receive owner proposal');
 const beforeStale=(await request('GET','/state',undefined,200)).data.units.find(u=>u.id===unit.id);
 await request('PATCH',`/units/${unit.id}`,{
  expectedRevision:beforeStale.revision,interiorNotes:'Manager touched a separate field'
 },200);
 await request('POST',`/owner-change-requests/${firstRequest.id}/approve`,{},409);
 assert.equal((await request('GET','/state',undefined,200)).data.units.find(u=>u.id===unit.id).area,beforeStale.area,'Stale approval must not overwrite apartment');
 assert.equal((await request('POST',`/owner-change-requests/${firstRequest.id}/reject`,{},200)).data.status,'rejected');
 await login('ownerjourney',ownerPassword);
 const secondRequest=(await request('POST',`/me/owned-units/${unit.id}/change-requests`,{
  field:'area',value:73.5,reason:'New proposal after manager reviewed revision conflict'
 })).data;
 await login('managerqa',managerPassword);
 const financialBeforeApproval=(await request('GET','/state',undefined,200)).data.units.find(u=>u.id===unit.id);
 assert.equal((await request('POST',`/owner-change-requests/${secondRequest.id}/approve`,{},200)).data.status,'approved');
 const approvedUnit=(await request('GET','/state',undefined,200)).data.units.find(u=>u.id===unit.id);
 assert.equal(approvedUnit.area,73.5,'Approved proposal was not applied');
 assert.equal(approvedUnit.revision,financialBeforeApproval.revision+1,'Approval must increment revision once');
 for(const key of ['rent','feePercent','deposit','ownerId','tenantId']){
  assert.deepEqual(approvedUnit[key],financialBeforeApproval[key],`Owner approval unexpectedly modified ${key}`);
 }
 await request('POST',`/owner-change-requests/${secondRequest.id}/approve`,{},409);
 await login('ownerjourney',ownerPassword);
 const ownerAfter=(await request('GET','/me/owned-units',undefined,200)).data;
 assert.equal(ownerAfter[0].area,73.5,'Owner must read approved data from official record');
 assert.ok((await request('GET','/me/owned-unit-change-requests',undefined,200)).data.some(r=>r.id===secondRequest.id&&r.status==='approved'));
 if(!pgMode){
  const {readFile}=await import('node:fs/promises');
  const disk=JSON.parse(await readFile(path.join(dataDir,'local-demo.json'),'utf8'));
  assert.equal(disk.units.find(u=>u.id===unit.id)?.area,73.5,'Owner approval must persist to the isolated JSON file');
 }
 await login('admin',password);
 await request('DELETE',`/auth/users/${registeredUser.id}/owner-clients/${owner.id}`,undefined,200);
 await login('ownerjourney',ownerPassword);
 assert.deepEqual((await request('GET','/me/owned-units',undefined,200)).data,[],'Revoking verification must immediately revoke apartment access');
 assert.deepEqual((await request('GET','/me/owned-unit-change-requests',undefined,200)).data,[],'Revoked owner must not read old private proposals');
 await request('POST',`/me/owned-units/${unit.id}/change-requests`,{field:'area',value:78,reason:'After revocation'},403);
 await request('POST','/auth/logout',{},200);
 await request('GET','/state',undefined,401);
 await request('GET','/me/owned-units',undefined,401);
 console.log('PASS / '+(pgMode?'PostgreSQL':'JSON demo')+' HTTP smoke: auth → CSV'+(process.argv.includes('--xlsx')?'/XLSX':'')+' → CRUD → fee history → lease/schedule → rent → deposit maker/checker/payer → archive/restore → RBAC → register/owner verify/correction/conflict/approve/revoke → logout');
}
try{await runner()}catch(error){console.error('HTTP smoke failed:',error.message);process.exitCode=1}finally{
 if(child){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),delay(1200)])}
 await rm(dataDir,{recursive:true,force:true});
}
