/** Verified property access is an explicit administrator attestation about an
 * existing owner-client record, NOT a role or a claim made during registration.
 * Every read re-checks the active unit's current ownerId, so a transfer revokes
 * the old owner's access without any background synchronization. */
import {active,fail,find,log,samePersistedId} from './domain.js';

const verifiedIds=user=>Array.isArray(user?.verifiedOwnerClientIds)?user.verifiedOwnerClientIds:[];
const isOwner=client=>active(client)&&['owner','both'].includes(client.type);
const matchedUnits=(db,user)=>{
 if(!user||!active(user)||user.status==='disabled')return [];
 const ids=verifiedIds(user);
 return (db.units||[]).filter(unit=>active(unit)&&ids.some(id=>samePersistedId(id,unit.ownerId))&&
  (db.clients||[]).some(client=>samePersistedId(client.id,unit.ownerId)&&isOwner(client)));
};
const safeUnit=(unit,user)=>({
 id:unit.id,code:unit.code||'',projectId:unit.projectId||'',building:unit.building||'',
 floor:unit.floor||'',room:unit.room||'',address:unit.address||'',
 area:unit.area??null,bedrooms:unit.bedrooms??null,
 interiorStatus:unit.interiorStatus||'',status:unit.status||'',
 personalNote:(Array.isArray(user.ownerUnitNotes)?user.ownerUnitNotes:[]).find(row=>samePersistedId(row.unitId,unit.id))?.note||''
});
export const ownedUnitCount=(db,user)=>matchedUnits(db,user).length;
export const verifiedOwnedUnits=(db,user)=>matchedUnits(db,user).map(unit=>safeUnit(unit,user));

export function verifyOwnerLink(db,userId,clientId,actor){
 if(actor?.role!=='admin')fail('Chỉ quản trị viên được xác minh chủ sở hữu',403);
 const user=find(db.users,userId,'Tài khoản');
 if(user.status==='disabled')fail('Không thể xác minh tài khoản bị khóa',409);
 const client=find(db.clients,clientId,'Chủ sở hữu');
 if(!isOwner(client))fail('Hồ sơ không phải chủ sở hữu đang hoạt động',409);
 const ids=verifiedIds(user);
 if(!ids.some(id=>samePersistedId(id,client.id))){
  if(ids.length>=20)fail('Một tài khoản chỉ được liên kết tối đa 20 hồ sơ chủ sở hữu',409);
  user.verifiedOwnerClientIds=[...ids,client.id];
  log(db,actor,'ownership.verified',user.id,null,{ownerClientId:client.id});
 }
 return {userId:user.id,verifiedOwnerClientIds:[...verifiedIds(user)]};
}
export function revokeOwnerLink(db,userId,clientId,actor){
 if(actor?.role!=='admin')fail('Chỉ quản trị viên được thu hồi xác minh',403);
 const user=find(db.users,userId,'Tài khoản');
 const had=verifiedIds(user).some(id=>samePersistedId(id,clientId));
 user.verifiedOwnerClientIds=verifiedIds(user).filter(id=>!samePersistedId(id,clientId));
 if(had)log(db,actor,'ownership.revoked',user.id,null,{ownerClientId:clientId});
 return {userId:user.id,verifiedOwnerClientIds:[...user.verifiedOwnerClientIds]};
}
/** Only a private owner note may be changed. The shared apartment, contracts,
 * receipts, fee policy and other owners' records remain completely immutable. */
export function saveOwnedUnitNote(db,userId,unitId,note){
 const user=find(db.users,userId,'Tài khoản');
 const unit=matchedUnits(db,user).find(row=>samePersistedId(row.id,unitId));
 if(!unit)fail('Không có quyền trên căn hộ này',403);
 if(typeof note!=='string'||note.length>500)fail('Ghi chú chỉ được tối đa 500 ký tự',400);
 const normalized=note.trim();
 const entries=Array.isArray(user.ownerUnitNotes)?user.ownerUnitNotes:[];
 user.ownerUnitNotes=[...entries.filter(row=>!samePersistedId(row.unitId,unit.id)),...(normalized?[{unitId:unit.id,note:normalized}]:[])];
 log(db,user,'ownership.personal_note_updated',unit.id,null,{hasNote:Boolean(normalized)});
 return {unitId:unit.id,note:normalized};
}

/** Owner-initiated corrections are proposals, never direct edits to shared records.
 * Stored with the requesting account, so existing JSON and PostgreSQL app_users
 * storage can persist them without a second, duplicate request ledger. */
import {create,number} from './domain.js';
import {assertUnitRevision,bumpUnitRevision,unitRevision} from './unit-revisions.js';
import {cleanUnit} from './unit-validation.js';
import {hasPermission} from './security.js';

export const OWNER_CORRECTION_FIELDS=Object.freeze({
 address:'Địa chỉ căn hộ',area:'Diện tích (m²)',bedrooms:'Số phòng ngủ',
 interiorStatus:'Tình trạng nội thất'
});
const requestRows=user=>Array.isArray(user?.ownerChangeRequests)?user.ownerChangeRequests:[];
const requestSafe=(request,viewer=false)=>({
 id:request.id,unitId:request.unitId,unitCode:request.unitCode||'',field:request.field,
 value:request.value,previousValue:request.previousValue,reason:request.reason,
 status:request.status,createdAt:request.createdAt,reviewedAt:request.reviewedAt||null,
 ...(viewer?{}:{requesterId:request.requesterId,requesterName:request.requesterName,reviewedBy:request.reviewedBy||null})
});
export function ownerChangeRequests(db,user){
 if(!user||!active(user)||user.status==='disabled')return [];
 const ids=matchedUnits(db,user).map(u=>u.id);
 return requestRows(user).filter(row=>row&&Object.hasOwn(OWNER_CORRECTION_FIELDS,row.field)&&ids.some(id=>samePersistedId(id,row.unitId)))
  .slice().reverse().slice(0,30).map(row=>requestSafe(row,true));
}
export function ownerChangeInbox(db,actor){
 if(!hasPermission(actor,'unit.write'))fail('Không đủ quyền duyệt đề nghị',403);
 return (db.users||[]).flatMap(user=>requestRows(user).filter(req=>req&&req.status==='pending'&&Object.hasOwn(OWNER_CORRECTION_FIELDS,req.field)).map(req=>requestSafe(req)))
  .sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,200);
}
function requestedValue(field,value){
 if(field==='area'||field==='bedrooms'){
  const v=number(value,OWNER_CORRECTION_FIELDS[field],10000);
  if(field==='bedrooms'&&v!==null&&!Number.isInteger(v))fail('Số phòng ngủ phải là số nguyên',400);
  return v;
 }
 if(typeof value!=='string')fail('Thông tin đề xuất phải là chuỗi ký tự',400);
 if(value.length>300)fail('Nội dung đề xuất vượt giới hạn',400);
 const trimmed=value.trim();
 if(field==='interiorStatus'&&!['','unfurnished','partial','furnished'].includes(trimmed))fail('Tình trạng nội thất không hợp lệ',400);
 return trimmed;
}
export function submitOwnerChange(db,userId,unitId,input){
 const user=find(db.users,userId,'Tài khoản');
 const unit=matchedUnits(db,user).find(row=>samePersistedId(row.id,unitId));
 if(!unit)fail('Không có quyền sở hữu đã xác minh trên căn hộ',403);
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['field','value','reason'].includes(k)))fail('Chỉ được đề nghị thay đổi thông tin mô tả',400);
 const field=input.field;
 if(!Object.hasOwn(OWNER_CORRECTION_FIELDS,field))fail('Thông số này không được phép đề nghị chỉnh sửa',403);
 if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>800)fail('Cần nêu lý do từ 1 đến 800 ký tự',400);
 const value=requestedValue(field,input.value);
 const validated=cleanUnit({[field]:value},db,unit)[field];
 if(Object.is(validated,unit[field]??(field==='area'||field==='bedrooms'?null:'')))fail('Giá trị đề nghị không thay đổi so với hồ sơ hiện tại',400);
 const rows=requestRows(user);
 if(rows.some(row=>row.status==='pending'&&samePersistedId(row.unitId,unit.id)))fail('Căn hộ đã có đề nghị đang chờ xử lý',409);
 if(rows.filter(row=>row.status==='pending').length>=10)fail('Bạn đang có quá nhiều đề nghị chờ xử lý',429);
 const row=create({status:'pending',unitId:unit.id,unitCode:unit.code||'',requesterId:user.id,
  requesterName:user.name||user.username||'',field,value:validated,previousValue:unit[field]??null,
  reason:input.reason.trim(),expectedRevision:unitRevision(unit)});
 user.ownerChangeRequests=[...rows,row];
 log(db,user,'owner_change.submitted',row.id,null,{unitId:unit.id,field});
 return requestSafe(row,true);
}
export function decideOwnerChange(db,requestId,actor,decision){
 if(!hasPermission(actor,'unit.write'))fail('Không đủ quyền duyệt đề nghị',403);
 if(!['approve','reject'].includes(decision))fail('Quyết định không hợp lệ',400);
 const owner=(db.users||[]).find(user=>requestRows(user).some(row=>samePersistedId(row.id,requestId)));
 if(!owner)fail('Đề nghị không tồn tại',404);
 const request=requestRows(owner).find(row=>samePersistedId(row.id,requestId));
 if(request.status!=='pending')fail('Đề nghị đã được xử lý',409);
 if(samePersistedId(actor.id,owner.id))fail('Không được tự duyệt yêu cầu của chính mình',403);
 if(decision==='approve'){
  const unit=matchedUnits(db,owner).find(row=>samePersistedId(row.id,request.unitId));
  if(!unit)fail('Quyền sở hữu đã thay đổi hoặc bị thu hồi; không thể duyệt',409);
  assertUnitRevision(unit,request.expectedRevision);
  if(!Object.hasOwn(OWNER_CORRECTION_FIELDS,request.field))fail('Thông số đề nghị không hợp lệ',403);
  const before=structuredClone(unit);
  const verifiedValue=requestedValue(request.field,request.value);
  const updated=cleanUnit({[request.field]:verifiedValue},db,unit);
  if(!Object.is(updated[request.field],request.value))fail('Giá trị đề nghị không còn hợp lệ',409);
  Object.assign(unit,updated);bumpUnitRevision(unit);
  log(db,actor,'owner_change.unit_updated',unit.id,{[request.field]:before[request.field]},{[request.field]:unit[request.field]});
 }
 request.status=decision==='approve'?'approved':'rejected';
 request.reviewedAt=new Date().toISOString();request.reviewedBy=actor.id;
 log(db,actor,'owner_change.'+request.status,request.id,null,{unitId:request.unitId,field:request.field});
 return requestSafe(request);
}
