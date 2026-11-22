import {APP_VERSION} from './runtime-version.js';
import {ownedUnitCount,verifiedOwnedUnits,verifyOwnerLink,revokeOwnerLink,saveOwnedUnitNote,submitOwnerChange,ownerChangeRequests,ownerChangeInbox,decideOwnerChange} from './ownership.js';
import {scoped,stateResponse,hasAssignedUnit} from './state-access.js';
import {apiPrivacyHeaders} from './api-privacy.js';
import express from 'express';
import {randomUUID,createHash} from 'node:crypto';
import {makeImportConfirmation,assertImportConfirmation} from './import-confirmation.js';
import {receiveDeposit} from './deposit-receipts.js';
import {assertSafeDepositReferenceEdit} from './finance-guards.js';
import {applyUnitFeePolicy} from './fee-policy.js';
import {changeCompanyDefaultFee} from './default-fee-policy.js';
import {LoginThrottle} from './login-throttle.js';
import {activateManagedAccount,resetManagedAccount,accountDisplayStatus,requestWorkspaceAccount,updateFavoriteUnits,validateNewPassword} from './account-onboarding.js';
import {postRentPayment} from './payment-operations.js';
import {prepareUnitImport,applyUnitImport} from './import-units.js';
import {readWorkbook,worksheetToRows,inspectWorkbook,inspectSheet,mappedRowsToCsv,mappedFileDigest,MAX_XLSX_BYTES} from './xlsx-units.js';
import {addPaymentAttachment,removeOrphanAttachment,resolveAttachment,validateAttachment,paymentEvidence,readVerifiedAttachment,MAX_ATTACHMENT_BYTES} from './payment-attachments.js';
import {submitDepositProposal,approveDepositProposal,rejectDepositProposal,executeDepositProposal} from './deposit-approvals.js';
import {queueDailyInternalReminders} from './reminder-jobs.js';
import {archiveType,archiveRecord,restoreRecord,archiveListing,hasActiveLink} from './lifecycle.js';
import {simulateBulkUnits,commitBulkUnits} from './bulk-units.js';
import {cleanUnit} from './unit-validation.js';
import {cleanFloor,cleanRoom} from './spatial-validation.js';
import {cleanClient} from './client-validation.js';
import {leasePayload,hasActiveUnitLease} from './lease-identity.js';
import {mirrorLease} from './lease-mirror.js';
import {assertUnitRevision,bumpUnitRevision} from './unit-revisions.js';
import {assertRecordRevision,bumpRecordRevision} from './record-revisions.js';
import {scanDataQuality} from './data-quality.js';
import {previewLeaseClosure,closeLease,assertReviewedLeaseTransition} from './lease-closure.js';
import {getDb,updateDb,bootstrapAdmin} from './store.js';
import {hashPassword,verifyPassword,canCommitLogin,canCommitSessionMutation,digest,token,hasPermission,ROLE_PERMISSIONS} from './security.js';
import {fail,text,number,vnd,percent,validateDate,active,find,create,log,safeAuditEntry,businessDate,generateSchedules,paidFor,hasPaymentHistory,feeFor,depositBalance,REMINDER_OUTCOMES,reminderQueue,samePersistedId} from './domain.js';

const app=express(),port=Number(process.env.PORT||4100);
app.disable('x-powered-by');app.use('/api',apiPrivacyHeaders);app.use(express.json({limit:'1250kb'}));
const cookieName='aurel_session';const today=()=>businessDate();
const pubUser=(user)=>({id:user.id,username:user.username,name:user.name,role:user.role,staffId:user.staffId||null,status:user.status||'active',accessStatus:accountDisplayStatus(user),verifiedOwnerClientIds:Array.isArray(user.verifiedOwnerClientIds)?[...user.verifiedOwnerClientIds]:[]});
const myUser=(user,db)=>({...pubUser(user),favoriteUnitIds:Array.isArray(user.favoriteUnitIds)?user.favoriteUnitIds:[],ownedUnitCount:db?ownedUnitCount(db,user):0});
const SESSION_MS=14*24*60*60*1000;
const makeSession=(db,user)=>{const value=token(),csrf=token(),expiresAt=Date.now()+SESSION_MS;db.sessions=db.sessions.filter(s=>s.expiresAt>Date.now());db.sessions.push(create({id:digest(value),userId:user.id,csrf,expiresAt}));return {value,csrf};};
const issueCookie=(res,value)=>res.cookie(cookieName,value,{...cookieOptions,maxAge:SESSION_MS});
const accountActive=(u)=>active(u)&&(u.status==null||u.status==='active');
const cookieOptions={httpOnly:true,sameSite:'lax',secure:process.env.COOKIE_SECURE==='true',path:'/'};
const parseCookie=(req)=>req.headers.cookie?.split(';').map(s=>s.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
const loginThrottle=new LoginThrottle();
const registrationThrottle=new LoginThrottle({limit:5,windowMs:30*60*1000});
async function authenticate(req,res,next){try{
 const raw=parseCookie(req);if(!raw)fail('Bạn cần đăng nhập',401);
 const db=await getDb(),sess=db.sessions.find(s=>s.id===digest(raw)&&s.expiresAt>Date.now());
 if(!sess)fail('Phiên đã hết hạn. Hãy đăng nhập lại',401);
 const user=db.users.find(u=>u.id===sess.userId&&accountActive(u));if(!user)fail('Tài khoản không khả dụng',401);
 req.user=user;req.session=sess;req.authDb=db;
 if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers['x-csrf-token']!==sess.csrf)fail('CSRF token không hợp lệ',403);
 next();
 }catch(e){next(e)}}
function permit(req,permission){if(!hasPermission(req.user,permission))fail('Không đủ quyền thực hiện thao tác này',403)}
function requireFreshAdmin(db,req){if(!canCommitSessionMutation(db,req.user,req.session,{role:'admin'}))fail('Phiên quản trị đã thay đổi hoặc hết hiệu lực; hãy đăng nhập lại',403);return db.users.find(user=>user.id===req.user.id)}

function cleanProject(input,db,current){const name=text(input.name,120),city=text(input.city,120),address=text(input.address,240);
 if(name&&db.projects.some(p=>!samePersistedId(p.id,current?.id)&&active(p)&&p.name.toLowerCase()===name.toLowerCase()))fail('Tên dự án đã tồn tại');return {name,city,address};}
function cleanBuilding(input,db,current){const projectId=text(input.projectId,100),code=text(input.code,50),name=text(input.name,120),address=text(input.address,240);
 if(projectId)find(db.projects,projectId,'Dự án');
 if(current&&!samePersistedId(current.projectId,projectId)&&(hasActiveLink(db,'units','buildingId',current.id)||hasActiveLink(db,'floors','buildingId',current.id)))fail('Tòa có căn hộ; hãy chuyển các căn trước khi chuyển tòa sang dự án khác');
 if(code&&db.buildings.some(b=>!samePersistedId(b.id,current?.id)&&active(b)&&samePersistedId(b.projectId,projectId)&&b.code.toLowerCase()===code.toLowerCase()))fail('Mã tòa bị trùng trong dự án');return {projectId,code,name,address};}
function cleanStaff(input){return {name:text(input.name,160),short:text(input.short,12),role:text(input.role,100),email:text(input.email,160),phone:text(input.phone,40),color:text(input.color||'#8FA9A2',20),notes:text(input.notes,800)};}


app.get('/api/health',(_req,res)=>res.json({ok:true,storage:process.env.AUREL_STORAGE==='postgres'?'postgres':'json-demo',version:APP_VERSION}));
// Readiness is distinct from liveness: a running HTTP listener does not prove database availability.
app.get('/api/ready',async(_req,res)=>{try{await getDb();res.json({ready:true})}catch(e){console.error('AUREL readiness failed:',e.code||e.message);res.status(503).json({ready:false,error:'Lưu trữ dữ liệu chưa sẵn sàng'})}});
app.post('/api/auth/login',async(req,res)=>{
 const loginKey=req.ip||'local';loginThrottle.assertAllowed(loginKey);const username=text(req.body?.username,100).toLowerCase(),password=String(req.body?.password||'');
 const db=await getDb(),user=db.users.find(u=>(accountActive(u)||(u.status==='pending'&&u.role==='viewer'&&!u.mustChangePassword))&&u.username.toLowerCase()===username);
 if(!user||!verifyPassword(password,user.passwordHash)){loginThrottle.recordFailure(loginKey);fail('Thông tin đăng nhập không đúng',401);}
 if(user.mustChangePassword===true)fail('Chọn “Dùng mật khẩu tạm” để đặt mật khẩu mới.',403);
 const session=await updateDb(d=>{
  const current=d.users.find(u=>u.id===user.id);
  // A password reset, account lock, username rename or archival might have
  // committed after getDb() but before this transaction acquired the lock.
  if(!canCommitLogin(user,current,username))fail('Thông tin đăng nhập đã thay đổi. Hãy thử đăng nhập lại.',401);
  if(current.status==='pending'&&current.role==='viewer')current.status='active';
  const created=makeSession(d,current);log(d,current,'auth.login',current.id);
  return {session:created,user:myUser(current,d)};
 });
 loginThrottle.clear(loginKey);
 issueCookie(res,session.session.value);res.json({user:session.user,csrf:session.session.csrf});
});
// New registrations are authenticated immediately as viewer. No administrator approval
// or extra login is required; all higher privileges remain server-controlled.
app.post('/api/auth/register',async(req,res)=>{
 const key=req.ip||'local';registrationThrottle.assertAllowed(key);registrationThrottle.recordFailure(key);
 const result=await updateDb(db=>{const {userId}=requestWorkspaceAccount(db,req.body||{});const user=find(db.users,userId,'Tài khoản');return {user:myUser(user,db),session:makeSession(db,user)};});
 issueCookie(res,result.session.value);res.status(201).json({user:result.user,csrf:result.session.csrf});
});
// Legacy managed-account activation remains available for existing employees.
app.post('/api/auth/activate',async(req,res)=>{
 const key=req.ip||'local';loginThrottle.assertAllowed(key);
 try{const result=await updateDb(db=>activateManagedAccount(db,req.body||{}));loginThrottle.clear(key);res.json(result)}
 catch(e){if(e.status===401)loginThrottle.recordFailure(key);throw e}
});
app.use('/api',authenticate);
app.get('/api/auth/me',(req,res)=>res.json({user:myUser(req.user,req.authDb),csrf:req.session.csrf}));
// Personal bookmarks belong to the authenticated user and never change a shared property.
app.put('/api/me/favorites/:unitId',async(req,res)=>{
 const result=await updateDb(db=>updateFavoriteUnits(db,req.user.id,req.params.unitId,true));res.json(result);
});
app.delete('/api/me/favorites/:unitId',async(req,res)=>{
 const result=await updateDb(db=>updateFavoriteUnits(db,req.user.id,req.params.unitId,false));res.json(result);
});
// Ownership is only established by an administrator after checking documents
// outside this application. Merely knowing a client's name or saving a favorite
// never grants property or financial permissions.
app.put('/api/auth/users/:id/owner-clients/:clientId',async(req,res)=>{
 if(req.user.role!=='admin')fail('Chỉ quản trị viên xác minh chủ sở hữu',403);
 const result=await updateDb(db=>verifyOwnerLink(db,req.params.id,req.params.clientId,requireFreshAdmin(db,req)));res.json(result);
});
app.delete('/api/auth/users/:id/owner-clients/:clientId',async(req,res)=>{
 if(req.user.role!=='admin')fail('Chỉ quản trị viên thu hồi xác minh',403);
 const result=await updateDb(db=>revokeOwnerLink(db,req.params.id,req.params.clientId,requireFreshAdmin(db,req)));res.json(result);
});
app.get('/api/me/owned-units',async(req,res)=>res.json(verifiedOwnedUnits(req.authDb,req.user)));
app.put('/api/me/owned-units/:unitId/note',async(req,res)=>{
 const body=req.body||{};
 if(Object.keys(body).length!==1||!Object.hasOwn(body,'note'))fail('Chỉ được cập nhật ghi chú cá nhân',400);
 const result=await updateDb(db=>saveOwnedUnitNote(db,req.user.id,req.params.unitId,body.note));res.json(result);
});
// Owner corrections are reviewed by management; the submitter never edits a shared unit.
app.get('/api/me/owned-unit-change-requests',(req,res)=>res.json(ownerChangeRequests(req.authDb,req.user)));
app.post('/api/me/owned-units/:unitId/change-requests',async(req,res)=>{
 const result=await updateDb(db=>submitOwnerChange(db,req.user.id,req.params.unitId,req.body));
 res.status(201).json(result);
});
app.get('/api/owner-change-requests',(req,res)=>res.json(ownerChangeInbox(req.authDb,req.user)));
app.post('/api/owner-change-requests/:id/:decision',async(req,res)=>{
 const result=await updateDb(db=>{if(!canCommitSessionMutation(db,req.user,req.session,{permission:'unit.write'}))fail('Quyền duyệt đề nghị đã thay đổi',403);return decideOwnerChange(db,req.params.id,db.users.find(u=>u.id===req.user.id),req.params.decision)});
 res.json(result);
});
app.patch('/api/auth/profile',async(req,res)=>{
 const input=req.body||{};if(Object.keys(input).some(key=>key!=='name'))fail('Chỉ được cập nhật tên hiển thị ở hồ sơ cá nhân',400);
 const name=text(input.name,120);if(name.length<2)fail('Tên hiển thị cần từ 2 đến 120 ký tự',400);
 const user=await updateDb(db=>{const current=find(db.users,req.user.id,'Tài khoản');const old={name:current.name};current.name=name;log(db,current,'auth.profile_updated',current.id,old,{name});return myUser(current,db)});
 res.json({user});
});
app.post('/api/auth/logout',async(req,res)=>{await updateDb(db=>{db.sessions=db.sessions.filter(s=>s.id!==req.session.id)});res.clearCookie(cookieName,cookieOptions);res.json({ok:true})});
app.post('/api/auth/change-password',async(req,res)=>{const {currentPassword,newPassword}=req.body||{};if(!verifyPassword(String(currentPassword||''),req.user.passwordHash))fail('Mật khẩu hiện tại không đúng');validateNewPassword(newPassword);if(verifyPassword(newPassword,req.user.passwordHash))fail('Mật khẩu mới phải khác mật khẩu hiện tại',409);await updateDb(db=>{if(!canCommitSessionMutation(db,req.user,req.session))fail('Phiên hoặc mật khẩu đã thay đổi. Hãy đăng nhập lại',401);const u=find(db.users,req.user.id,'Tài khoản');u.passwordHash=hashPassword(newPassword);db.sessions=db.sessions.filter(s=>s.userId!==u.id);log(db,u,'auth.password_changed',u.id)});res.clearCookie(cookieName,cookieOptions);res.json({ok:true})});
app.get('/api/state',async(req,res)=>res.json(stateResponse(req,await getDb(),pubUser)));
app.get('/api/quality',async(req,res)=>{permit(req,'audit.read');const db=await getDb();res.json(scanDataQuality(db));});
app.get('/api/audit',async(req,res)=>{permit(req,'audit.read');const db=await getDb();res.json(db.audit.slice(0,500).map(safeAuditEntry))});
function CRUD(route,collection,perm,clean,{beforeDelete,revisioned=false}={}){
 app.post('/api/'+route,async(req,res)=>{permit(req,perm);const result=await updateDb(db=>{
  const payload=clean(req.body||{},db,null),row=create(payload);if(revisioned)bumpRecordRevision(row);db[collection].push(row);log(db,req.user,`${collection}.create`,row.id,null,row);return row;});res.status(201).json(result)});
 app.patch('/api/'+route+'/:id',async(req,res)=>{permit(req,perm);const result=await updateDb(db=>{
  const row=find(db[collection],req.params.id,'Hồ sơ');if(revisioned)assertRecordRevision(row,req.body?.expectedRevision,'Hồ sơ khách hàng');const before=structuredClone(row);Object.assign(row,clean({...row,...req.body},db,row));if(revisioned)bumpRecordRevision(row);log(db,req.user,`${collection}.update`,row.id,before,row);return row;});res.json(result)});
 app.delete('/api/'+route+'/:id',async(req,res)=>{permit(req,perm);const result=await updateDb(db=>{
  const row=find(db[collection],req.params.id,'Hồ sơ');if(beforeDelete)beforeDelete(db,row);return archiveRecord(db,collection,row.id,req.user)});res.json(result)});
}
CRUD('projects','projects','project.write',cleanProject,{beforeDelete:(db,row)=>{if(hasActiveLink(db,'units','projectId',row.id)||hasActiveLink(db,'buildings','projectId',row.id))fail('Dự án vẫn có tòa nhà hoặc căn hộ; hãy chuyển hoặc lưu trữ các hồ sơ con trước')}});
CRUD('buildings','buildings','building.write',cleanBuilding,{beforeDelete:(db,row)=>{if(hasActiveLink(db,'units','buildingId',row.id)||hasActiveLink(db,'floors','buildingId',row.id))fail('Tòa còn tầng hoặc căn hộ; hãy chuyển hoặc lưu trữ hồ sơ con')}});
CRUD('floors','floors','building.write',cleanFloor,{beforeDelete:(db,row)=>{if(hasActiveLink(db,'rooms','floorId',row.id)||hasActiveLink(db,'units','floorId',row.id))fail('Tầng còn phòng hoặc căn hộ',409)}});
CRUD('rooms','rooms','building.write',cleanRoom,{beforeDelete:(db,row)=>{if(hasActiveLink(db,'units','roomId',row.id))fail('Phòng còn căn hộ liên kết',409)}});
CRUD('clients','clients','client.write',cleanClient,{revisioned:true,beforeDelete:(db,row)=>{if(hasActiveLink(db,'units','ownerId',row.id)||hasActiveLink(db,'units','tenantId',row.id))fail('Khách hàng còn liên kết căn hộ; cần chuyển hồ sơ liên kết trước')}});
CRUD('staff','staff','staff.write',cleanStaff,{beforeDelete:(db,row)=>{if(hasActiveLink(db,'units','managerId',row.id)||hasActiveLink(db,'units','saleId',row.id))fail('Hãy bàn giao các căn hộ của nhân viên trước')}});
// Recycle bin: only the roles allowed to modify a collection may see or restore it.
app.get('/api/archives',async(req,res)=>{
 const db=await getDb();res.json(archiveListing(db,permission=>hasPermission(req.user,permission)));
});
app.post('/api/archives/:collection/:id/restore',async(req,res)=>{
 const {collection,id}=req.params, config=archiveType(collection);
 if(!config)fail('Loại hồ sơ không hợp lệ',404);
 permit(req,config.permission);
 const result=await updateDb(db=>restoreRecord(db,collection,id,req.user));res.json(result);
});
// Validation and commit both run on the server. Import is all-or-nothing for new rows.
app.post('/api/import/units/preview',async(req,res)=>{permit(req,'unit.write');const csv=req.body?.csv;if(typeof csv!=='string'||!csv.trim()||Buffer.byteLength(csv,'utf8')>1024*1024)fail('CSV phải có dữ liệu và không vượt quá 1 MB');const db=await getDb();const report=prepareUnitImport(db,csv);const {prepared,...safe}=report,digestValue=createHash('sha256').update(csv).digest('hex');res.json({...safe,digest:digestValue,previewToken:makeImportConfirmation(req.user.id,digestValue)});});
app.post('/api/import/units/commit',async(req,res)=>{permit(req,'unit.write');const csv=req.body?.csv,digestValue=req.body?.digest;
 if(typeof csv!=='string'||!csv.trim()||Buffer.byteLength(csv,'utf8')>1024*1024||typeof digestValue!=='string'||digestValue!==createHash('sha256').update(csv).digest('hex'))fail('Dữ liệu nhập đã thay đổi sau khi xem trước',409);
 assertImportConfirmation(req.user.id,digestValue,req.body?.previewToken);
 const result=await updateDb(db=>{const output=applyUnitImport(db,csv,req.user);log(db,req.user,'units.csv_import','batch',null,output);return output});res.status(201).json(result);
});
// XLSX is parsed server-side and validated through the exact CSV domain rules.
// The same file, sheet and mapping must be submitted again for confirmation.
const xlsxBody=express.raw({type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',limit:MAX_XLSX_BYTES});
function readImportMapping(req){
 const raw=req.headers['x-aurel-mapping'];
 if(typeof raw!=='string'||raw.length>2000)fail('Thiếu cấu hình ánh xạ cột',400);
 try{return JSON.parse(raw)}catch{fail('Cấu hình ánh xạ cột không phải JSON',400)}
}
function readSheet(req,wb){
 const encoded=req.headers['x-aurel-sheet-encoded'];
 let name=req.headers['x-aurel-sheet'];
 if(encoded!==undefined){
  if(typeof encoded!=='string'||encoded.length>1080)fail('Tên trang tính không hợp lệ');
  try{name=decodeURIComponent(encoded)}catch{fail('Tên trang tính không hợp lệ')}
 }
 if(typeof name!=='string'||!name||name.length>120)fail('Chưa chọn trang tính');
 return wb.worksheets.find(ws=>ws.name===name);
}
app.post('/api/import/units/xlsx/inspect',xlsxBody,async(req,res)=>{
 permit(req,'unit.write');const wb=await readWorkbook(req.body);
 const sheets=inspectWorkbook(wb);
 let firstError;
 for(const sheet of wb.worksheets){
  let inspected;
  try{inspected=inspectSheet(worksheetToRows(sheet))}
  catch(error){
   if(error.status!==400)throw error;
   firstError??=error;
   continue;
  }
  if(inspected.rows===0)continue;
  return res.json({...sheets,selected:sheet.name,...inspected});
 }
 if(firstError)throw firstError;
 fail('Không có trang tính chứa dữ liệu');
});
app.post('/api/import/units/xlsx/sheet',xlsxBody,async(req,res)=>{
 permit(req,'unit.write');const wb=await readWorkbook(req.body),ws=readSheet(req,wb);
 res.json(inspectSheet(worksheetToRows(ws)));
});
app.post('/api/import/units/xlsx/preview',xlsxBody,async(req,res)=>{
 permit(req,'unit.write');const mapping=readImportMapping(req),wb=await readWorkbook(req.body),ws=readSheet(req,wb);
 const csv=mappedRowsToCsv(worksheetToRows(ws),mapping),db=await getDb(),report=prepareUnitImport(db,csv);
 const {prepared,...safe}=report;
 const digestValue=mappedFileDigest(req.body,ws.name,mapping);res.json({...safe,digest:digestValue,previewToken:makeImportConfirmation(req.user.id,digestValue)});
});
app.post('/api/import/units/xlsx/commit',xlsxBody,async(req,res)=>{
 permit(req,'unit.write');const mapping=readImportMapping(req),wb=await readWorkbook(req.body),ws=readSheet(req,wb);
 const expected=req.headers['x-aurel-digest'];
 if(typeof expected!=='string'||expected!==mappedFileDigest(req.body,ws.name,mapping))fail('Tệp hoặc ánh xạ thay đổi so với bước xem trước',409);
 assertImportConfirmation(req.user.id,expected,req.headers['x-aurel-preview-token']);
 const csv=mappedRowsToCsv(worksheetToRows(ws),mapping);
 const result=await updateDb(db=>{
  const output=applyUnitImport(db,csv,req.user);log(db,req.user,'units.xlsx_import','batch',null,{...output,sheet:ws.name});return output;
 });res.status(201).json(result);
});
// Payment evidence: allow only authenticated accounting roles; files are never public.
const proofBody=express.raw({type:['application/pdf','image/png','image/jpeg'],limit:MAX_ATTACHMENT_BYTES});
app.post('/api/payments/:id/attachments',proofBody,async(req,res)=>{
 permit(req,'payment.write');const mime=(req.headers['content-type']||'').split(';')[0].trim();
 const name=req.headers['x-aurel-filename'];validateAttachment(req.body,mime,name);
 let saved=null;
 try{
  const result=await updateDb(async db=>{
   const entry=await addPaymentAttachment(db,req.body,mime,name,req.params.id,req.user);saved=entry.diskName;
   const {diskName,...publicRecord}=entry;return publicRecord;
  });res.status(201).json(result);
 }catch(e){if(saved)await removeOrphanAttachment(saved);throw e}
});
app.get('/api/payments/:id/attachments',async(req,res)=>{
 permit(req,'payment.write');const db=await getDb();find(db.payments,req.params.id,'Giao dịch');res.json(paymentEvidence(db,req.params.id));
});
app.get('/api/payment-attachments/:id/download',async(req,res)=>{
 permit(req,'payment.write');const db=await getDb(),entry=find(db.paymentAttachments,req.params.id,'Chứng từ');
 find(db.payments,entry.paymentId,'Giao dịch');
 // Never serve an attachment until its stored bytes match the original
 // receipt checksum and metadata. Sending the verified buffer also avoids
 // a check-then-download filesystem race.
 const content=await readVerifiedAttachment(entry);
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
 res.attachment(entry.filename);res.type(entry.mime);res.send(content);
});
// Batch operational edits: preview → confirm, with optimistic fingerprint and one transaction.
app.post('/api/units/bulk/preview',async(req,res)=>{
 permit(req,'unit.write');const db=await getDb();
 const changes=req.body?.changes||{};
 if('feePercent' in changes||'feeBasis' in changes)permit(req,'fee.write');
 const result=simulateBulkUnits(db,req.body,cleanUnit,{day:today()});
 res.json({fingerprint:result.fingerprint,changed:result.changed,total:result.rows.length,rows:result.rows});
});
app.post('/api/units/bulk/commit',async(req,res)=>{
 permit(req,'unit.write');const changes=req.body?.changes||{};
 if('feePercent' in changes||'feeBasis' in changes)permit(req,'fee.write');
 const result=await updateDb(db=>commitBulkUnits(db,req.body,cleanUnit,req.user,{day:today()}));res.json(result);
});
app.post('/api/units',async(req,res)=>{permit(req,'unit.write');const result=await updateDb(db=>{
 const base={id:randomUUID(),createdAt:new Date().toISOString(),code:'',projectId:'',buildingId:'',building:'',floorId:'',roomId:'',floor:'',room:'',interiorStatus:'',interiorNotes:'',address:'',owner:'',tenant:'',ownerId:'',tenantId:'',managerId:'',saleId:'',notes:'',leaseStart:'',leaseEnd:'',feeBasis:'due',status:'draft',area:null,bedrooms:null,rent:null,renewalRent:null,feePercent:null,deposit:null,paymentDay:null};
 const row=cleanUnit(req.body||{},db,base);bumpUnitRevision(row);db.units.push(row);if(row.feePercent!==null)db.feeHistory.push(create({unitId:row.id,percent:row.feePercent,basis:row.feeBasis,effectiveFrom:today(),reason:'Thiết lập ban đầu',changedBy:req.user.id}));log(db,req.user,'unit.create',row.id,null,row);return row;});res.status(201).json(result)});
app.patch('/api/units/:id',async(req,res)=>{permit(req,'unit.write');const result=await updateDb(db=>{
 const row=find(db.units,req.params.id,'Căn hộ');assertUnitRevision(row,req.body?.expectedRevision);const before=structuredClone(row),updated=cleanUnit(req.body||{},db,row);
 if(updated.status==='ended'&&before.status!=='ended'&&hasActiveUnitLease(db,row.id))fail('Hãy kết thúc hợp đồng đang hoạt động tại trang Hợp đồng trước');
 if(hasActiveUnitLease(db,row.id)&&updated.status!=='occupied')fail('Không thể đổi trạng thái căn hộ khi còn hợp đồng đang hiệu lực');
 const changedFee=updated.feePercent!==before.feePercent||updated.feeBasis!==before.feeBasis;
 if(changedFee){permit(req,'fee.write');const effectiveFrom=validateDate(req.body.feeEffectiveFrom||today(),'Ngày hiệu lực');
  if(effectiveFrom<today())fail('Không được đổi chính sách phí có hiệu lực hồi tố bằng biểu mẫu thường');
  const reason=text(req.body.feeReason||'Điều chỉnh từ hồ sơ căn hộ');
  applyUnitFeePolicy(db,{unitId:row.id,before,after:updated,effectiveFrom,reason,actorId:req.user.id});
 }
 if('deposit' in req.body)assertSafeDepositReferenceEdit(db,row.id,before.deposit,updated.deposit);
 if('rent' in req.body&&req.body.rent!==before.rent&&db.schedules.some(s=>samePersistedId(s.unitId,row.id)&&paidFor(db,s.id)>0)){
  // Unit's asking price may change; issued lease/schedules remain immutable.
 }
 Object.assign(row,updated);bumpUnitRevision(row);log(db,req.user,'unit.update',row.id,before,row);return row;
 });res.json(result)});
app.delete('/api/units/:id',async(req,res)=>{permit(req,'unit.write');const result=await updateDb(db=>{
 const row=find(db.units,req.params.id,'Căn hộ');if(hasActiveUnitLease(db,row.id))fail('Cần kết thúc hợp đồng trước khi lưu trữ căn hộ');return archiveRecord(db,'units',row.id,req.user);});res.json(result)});
app.post('/api/leases',async(req,res)=>{permit(req,'lease.write');const result=await updateDb(db=>{
 const lease=leasePayload({...req.body,status:req.body?.status||'draft'},db,{id:randomUUID(),unitId:'',tenantId:'',tenantName:'',startsOn:'',endsOn:'',rent:null,depositExpected:null,paymentDay:1,status:'draft'});
 lease.createdAt=new Date().toISOString();bumpRecordRevision(lease);db.leases.push(lease);mirrorLease(db,lease);const generated=generateSchedules(db,lease);log(db,req.user,'lease.create',lease.id,null,{...lease,generated:generated.length});return lease;});res.status(201).json(result)});
app.patch('/api/leases/:id',async(req,res)=>{permit(req,'lease.write');const result=await updateDb(db=>{
 const lease=find(db.leases,req.params.id,'Hợp đồng');assertRecordRevision(lease,req.body?.expectedRevision,'Hợp đồng');const before=structuredClone(lease),updated=leasePayload({...lease,...req.body},db,lease);
 const termsChanged=['startsOn','endsOn','rent','unitId','paymentDay'].some(k=>updated[k]!==before[k]);
 if(before.status==='ended'&&updated.status!=='ended')fail('Hợp đồng đã kết thúc chỉ được lưu trữ, không thể kích hoạt lại');
 if(before.status==='active'&&updated.status==='draft')fail('Không thể chuyển hợp đồng đã kích hoạt về bản nháp');
 if(termsChanged&&(db.payments.some(p=>samePersistedId(p.leaseId,lease.id))||db.schedules.some(s=>samePersistedId(s.leaseId,lease.id)&&s.status==='historical')||db.reminderContacts.some(c=>samePersistedId(c.leaseId,lease.id))))fail('Hợp đồng đã có kỳ lịch sử, lịch nhắc hoặc thanh toán; hãy gia hạn hoặc tạo hợp đồng mới');
 if(termsChanged&&before.status==='active'&&before.startsOn<=today())fail('Hợp đồng đã bắt đầu; không sửa hồi tố điều khoản tài chính. Hãy tạo gia hạn');
 // Keep the PATCH editor compatible but never leave future uncollected rent active after early termination.
 assertReviewedLeaseTransition(before,updated);
 if('terminatedOn' in (req.body||{})||'terminationReason' in (req.body||{}))fail('Chỉ ghi ngày/lý do khi kết thúc hợp đồng');
 Object.assign(lease,updated);bumpRecordRevision(lease);mirrorLease(db,lease);
 if(termsChanged)db.schedules=db.schedules.filter(s=>!samePersistedId(s.leaseId,lease.id));
 generateSchedules(db,lease);log(db,req.user,'lease.update',lease.id,before,lease);return lease;});res.json(result)});
app.delete('/api/leases/:id',async(req,res)=>{permit(req,'lease.write');const result=await updateDb(db=>{
 const l=find(db.leases,req.params.id,'Hợp đồng');if(db.payments.some(p=>samePersistedId(p.leaseId,l.id))||db.depositTransactions.some(t=>samePersistedId(t.leaseId,l.id))||db.reminderContacts.some(c=>samePersistedId(c.leaseId,l.id)))fail('Hợp đồng đã phát sinh giao dịch hoặc lịch sử liên hệ, chỉ được kết thúc');
 if(l.status==='active')fail('Hãy kết thúc hợp đồng đang hoạt động trước');db.schedules=db.schedules.filter(s=>!samePersistedId(s.leaseId,l.id));return archiveRecord(db,'leases',l.id,req.user);});res.json(result)});
// Early termination: review future untouched periods before closing; preserve part-payments.
app.post('/api/leases/:id/close-preview',async(req,res)=>{
 permit(req,'lease.write');const db=await getDb(),lease=find(db.leases,req.params.id,'Hợp đồng');
 res.json(previewLeaseClosure(db,lease,req.body||{},today()));
});
app.post('/api/leases/:id/close',async(req,res)=>{
 permit(req,'lease.write');const result=await updateDb(db=>{
  const lease=find(db.leases,req.params.id,'Hợp đồng');
  const report=previewLeaseClosure(db,lease,req.body||{},today());
  if(req.body?.fingerprint!==report.fingerprint)fail('Dữ liệu kỳ thu đã thay đổi sau khi xem trước. Hãy kiểm tra lại.',409);
  return closeLease(db,lease,req.body||{},req.user,today());
 });res.json(result);
});
app.post('/api/leases/:id/renew',async(req,res)=>{permit(req,'lease.write');const result=await updateDb(db=>{
 const old=find(db.leases,req.params.id,'Hợp đồng');if(!['active','ended'].includes(old.status))fail('Chỉ gia hạn hợp đồng đã kích hoạt');
 const next=leasePayload({unitId:old.unitId,tenantId:old.tenantId||'',tenantName:old.tenantName,startsOn:req.body?.startsOn,endsOn:req.body?.endsOn,rent:req.body?.rent??old.rent,paymentDay:req.body?.paymentDay??old.paymentDay,depositExpected:old.depositExpected,status:'active'},db,{id:randomUUID(),unitId:old.unitId,status:'draft'});
 if(next.startsOn<=old.endsOn)fail('Ngày bắt đầu hợp đồng gia hạn phải sau ngày kết thúc hợp đồng cũ');
 old.status='ended';bumpRecordRevision(old);bumpRecordRevision(next);db.leases.push(next);mirrorLease(db,next);generateSchedules(db,next);log(db,req.user,'lease.renew',next.id,{oldLeaseId:old.id},next);return next;});res.status(201).json(result)});
app.post('/api/leases/:id/generate-schedule',async(req,res)=>{permit(req,'lease.write');const result=await updateDb(db=>{const lease=find(db.leases,req.params.id,'Hợp đồng');const rows=generateSchedules(db,lease);log(db,req.user,'schedule.generate',lease.id,null,{created:rows.length});return {created:rows.length};});res.json(result)});
app.post('/api/payments',async(req,res)=>{permit(req,'payment.write');const result=await updateDb(db=>postRentPayment(db,req.body||{},req.user,today()));res.status(201).json(result)});
app.post('/api/payments/:id/reverse',async(req,res)=>{permit(req,'payment.write');const result=await updateDb(db=>{
 const payment=find(db.payments,req.params.id,'Khoản thanh toán');if(payment.status!=='posted')fail('Khoản tiền đã được đảo');const reason=text(req.body?.reason,500);if(reason.length<5)fail('Cần lý do điều chỉnh rõ ràng');payment.status='reversed';payment.reversalReason=reason;payment.reversedAt=new Date().toISOString();payment.reversedBy=req.user.id;log(db,req.user,'payment.reversed',payment.id,null,{reason});return payment;});res.json(result)});
app.post('/api/deposits/:id/receive',async(req,res)=>{
 permit(req,'deposit.write');
 const result=await updateDb(db=>receiveDeposit(db,req.params.id,req.body||{},req.user,today()));
 res.status(201).json(result);
});
// Legacy direct settlement is disabled: no single-click bypass of maker/checker approval.
app.post('/api/deposits/:id/settle',(_req,res)=>res.status(409).json({error:'Vui lòng tạo đề nghị hoàn cọc và hoàn tất quy trình phê duyệt'}));
app.post('/api/deposits/:id/proposals',async(req,res)=>{permit(req,'deposit.write');const result=await updateDb(db=>submitDepositProposal(db,req.params.id,req.body||{},req.user));res.status(201).json(result)});
app.post('/api/deposit-proposals/:id/approve',async(req,res)=>{permit(req,'deposit.approve');const result=await updateDb(db=>approveDepositProposal(db,req.params.id,req.user));res.json(result)});
app.post('/api/deposit-proposals/:id/reject',async(req,res)=>{permit(req,'deposit.approve');const result=await updateDb(db=>rejectDepositProposal(db,req.params.id,req.user,req.body?.reason));res.json(result)});
app.post('/api/deposit-proposals/:id/execute',async(req,res)=>{permit(req,'deposit.execute');const result=await updateDb(db=>executeDepositProposal(db,req.params.id,req.user,req.body||{},today()));res.json(result)});
app.get('/api/reminders',async(req,res)=>{const db=scoped(req,await getDb()),now=today();res.json({today:now,items:reminderQueue(db,now)});});
app.post('/api/reminders/refresh',async(req,res)=>{permit(req,'reminder.refresh');const result=await updateDb(db=>queueDailyInternalReminders(db,today(),req.user));res.json(result)});
app.post('/api/reminders/:id/read',async(req,res)=>{permit(req,'reminder.write');const result=await updateDb(db=>{const n=find(db.reminderNotifications,req.params.id,'Thông báo');if(req.user.role==='staff'&&!hasAssignedUnit(db.units,n.unitId,req.user.staffId))fail('Ngoài danh mục được giao',403);n.status='read';n.readBy=req.user.id;n.readAt=new Date().toISOString();return n});res.json(result)});
app.post('/api/reminders/:scheduleId/contacts',async(req,res)=>{permit(req,'reminder.write');const result=await updateDb(db=>{
 const sch=find(db.schedules,req.params.scheduleId,'Kỳ thu');if(sch.status!=='open')fail('Chỉ được ghi nhận liên hệ cho kỳ thu đang mở');
 if(req.user.role==='staff'&&!hasAssignedUnit(db.units,sch.unitId,req.user.staffId))fail('Kỳ thu nằm ngoài danh mục được giao',403);
 if(sch.amount-paidFor(db,sch.id)<=0)fail('Kỳ thu đã được thanh toán đủ');
 const outcome=text(req.body?.outcome,40);if(!REMINDER_OUTCOMES[outcome])fail('Kết quả liên hệ không hợp lệ');
 const note=text(req.body?.note,600),nextContactOn=validateDate(req.body?.nextContactOn,'Ngày hẹn nhắc lại');
 if(nextContactOn&&nextContactOn<today())fail('Ngày nhắc lại không thể trong quá khứ');
 if(outcome==='promised'&&!nextContactOn)fail('Khách hẹn thanh toán phải có ngày hẹn');
 const record=create({scheduleId:sch.id,leaseId:sch.leaseId,unitId:sch.unitId,outcome,note,nextContactOn,contactedAt:new Date().toISOString(),createdBy:req.user.id});
 db.reminderContacts.push(record);log(db,req.user,'reminder.contact',record.id,null,record);return record;
 });res.status(201).json(result)});
app.patch('/api/preferences',async(req,res)=>{permit(req,'settings.write');const result=await updateDb(db=>{
 const old=structuredClone(db.preferences),input=req.body||{};
 if('company' in input)db.preferences.company=text(input.company,120);
 if('reminderDays' in input){const n=number(input.reminderDays,'Ngày nhắc',90);if(n==null||!Number.isInteger(n))fail('Số ngày nhắc không hợp lệ');db.preferences.reminderDays=n;}
 if('defaultFee' in input){
  const value=percent(input.defaultFee);
  if(value===null)fail('Không được để trống tỷ lệ phí mặc định; nhập 0 nếu muốn áp dụng 0%');
  changeCompanyDefaultFee(db,value,{effectiveOn:today(),actorId:req.user.id,reason:input.defaultFeeReason});
 }
 log(db,req.user,'preferences.update','global',old,db.preferences);return db.preferences;});res.json(result)});
app.post('/api/auth/users',async(req,res)=>{if(req.user.role!=='admin')fail('Chỉ quản trị viên tạo tài khoản',403);const {username,password,role,staffId,name}=req.body||{};if(!ROLE_PERMISSIONS[role])fail('Vai trò không hợp lệ');if(String(password||'').length<12)fail('Mật khẩu tối thiểu 12 ký tự');const result=await updateDb(db=>{requireFreshAdmin(db,req);const handle=text(username,80).toLowerCase();if(!/^[a-z0-9_.-]{3,80}$/.test(handle)||db.users.some(u=>u.username===handle&&active(u)))fail('Tên đăng nhập không hợp lệ hoặc đã tồn tại');if(staffId)find(db.staff,staffId,'Nhân viên');const user=create({name:text(name||handle),username:handle,role,staffId:staffId||null,status:req.body?.status==='disabled'?'disabled':'active',passwordHash:hashPassword(password),mustChangePassword:req.body?.activationRequired===true||req.body?.activationRequired==='true'});db.users.push(user);log(db,req.user,'users.create',user.id);return pubUser(user)});res.status(201).json(result)});
// An administrator can issue a replacement temporary password; previous sessions expire.
app.post('/api/auth/users/:id/reset-password',async(req,res)=>{
 if(req.user.role!=='admin')fail('Chỉ quản trị viên cấp lại mật khẩu',403);
 if(req.user.id===req.params.id)fail('Hãy sử dụng chức năng đổi mật khẩu cá nhân',403);
 const result=await updateDb(db=>pubUser(resetManagedAccount(db,req.params.id,req.body?.temporaryPassword,requireFreshAdmin(db,req))));
 res.json(result)
});
app.patch('/api/auth/users/:id',async(req,res)=>{if(req.user.role!=='admin')fail('Chỉ quản trị viên cấp quyền',403);const result=await updateDb(db=>{
 requireFreshAdmin(db,req);const user=find(db.users,req.params.id,'Tài khoản'),old=pubUser(user);if(req.body?.role){if(!ROLE_PERMISSIONS[req.body.role])fail('Vai trò không hợp lệ');if(user.id===req.user.id&&req.body.role!=='admin')fail('Không thể tự tước quyền admin');user.role=req.body.role;}
 if('staffId' in (req.body||{})){if(req.body.staffId)find(db.staff,req.body.staffId,'Nhân viên');user.staffId=req.body.staffId||null;}if('name' in (req.body||{}))user.name=text(req.body.name,120);
 if('status' in (req.body||{})){if(!['active','disabled'].includes(req.body.status))fail('Trạng thái tài khoản không hợp lệ');
  if(user.id===req.user.id&&req.body.status==='disabled')fail('Không thể tự khóa tài khoản');
  if(user.role==='admin'&&req.body.status==='disabled'&&db.users.filter(u=>u.role==='admin'&&accountActive(u)).length<=1)fail('Không được khóa quản trị viên cuối cùng');
  user.status=req.body.status;}

 db.sessions=db.sessions.filter(s=>s.userId!==user.id||s.id===req.session.id&&user.id===req.user.id&&user.status!=='disabled');log(db,req.user,'users.update',user.id,old,pubUser(user));return pubUser(user);});res.json(result)});
app.use((err,_req,res,_next)=>{if(err instanceof SyntaxError&&'body' in err)return res.status(400).json({error:'JSON không hợp lệ'});if((err.status||500)>=500)console.error(err);res.status(err.status||500).json({error:err.status?err.message:'Lỗi máy chủ'})});
await bootstrapAdmin();
if(process.env.NODE_ENV!=='test'){
 const daily=async()=>{try{await updateDb(db=>queueDailyInternalReminders(db,today()))}catch(e){console.error('Không tạo được nhắc việc nội bộ:',e.message)}};
 await daily();setInterval(daily,60*60*1000).unref();
 app.listen(port,process.env.AUREL_API_HOST||'127.0.0.1',()=>console.log(`AUREL API http://localhost:${port} · ${process.env.AUREL_STORAGE==='postgres'?'PostgreSQL':'JSON DEMO'}`));
}
export default app;
