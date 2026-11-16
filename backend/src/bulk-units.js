/**
 * Atomic bulk-edit preview and commit for operational unit fields.
 * Preview is a dry run. Commit rechecks the exact source records and all business constraints.
 * Money and payment/contract ledgers cannot be edited with this route.
 */
import {createHash} from 'node:crypto';
import {fail,find,log,validateDate,text} from './domain.js';
import {applyUnitFeePolicy} from './fee-policy.js';
import {bumpUnitRevision} from './unit-revisions.js';

export const BULK_UNIT_FIELDS=Object.freeze([
 'projectId','buildingId','floorId','roomId','floor','room','address','interiorStatus','interiorNotes','managerId','saleId','feePercent','feeBasis'
]);
const allowed=new Set(BULK_UNIT_FIELDS);
const isObject=(value)=>value!==null&&typeof value==='object'&&!Array.isArray(value);

function normalized(input,day){
 if(!isObject(input))fail('Yêu cầu chỉnh sửa hàng loạt không hợp lệ');
 const ids=input.ids;
 if(!Array.isArray(ids)||ids.length<1||ids.length>100||ids.some(x=>typeof x!=='string'||!x.trim())||new Set(ids).size!==ids.length)fail('Chọn 1–100 mã hồ sơ khác nhau');
 if(!isObject(input.changes))fail('Chưa có trường cần thay đổi');
 const fields=Object.keys(input.changes);
 if(!fields.length||fields.some(key=>!allowed.has(key)))fail('Trường chỉnh sửa hàng loạt không được hỗ trợ');
 const feeRequested=fields.some(key=>['feePercent','feeBasis'].includes(key));
 const effectiveFrom=feeRequested?validateDate(input.feeEffectiveFrom||day,'Ngày hiệu lực phí'):null;
 if(effectiveFrom&&effectiveFrom<day)fail('Không được đặt hiệu lực hồi tố cho phần trăm phí');
 const reason=feeRequested?text(input.feeReason,500):'';
 if(feeRequested&&reason.length<5)fail('Cần ghi lý do thay đổi tỷ lệ phí (từ 5 ký tự)');
 return {ids,changes:Object.fromEntries(fields.map(k=>[k,input.changes[k]])),feeRequested,effectiveFrom,reason};
}

function fingerprint(db,request){
 const ids=new Set(request.ids);
 const scope={version:9,request,
  units:db.units.filter(x=>ids.has(x.id)),
  schedules:db.schedules.filter(x=>ids.has(x.unitId)),
  feeHistory:db.feeHistory.filter(x=>ids.has(x.unitId)),
  projects:db.projects,buildings:db.buildings,floors:db.floors,rooms:db.rooms,staff:db.staff,clients:db.clients,
  payments:db.payments.filter(x=>ids.has(x.unitId))};
 return createHash('sha256').update(JSON.stringify(scope)).digest('hex');
}

export function simulateBulkUnits(db,input,cleanUnit,{day}){
 const request=normalized(input,day);
 const originalFingerprint=fingerprint(db,request);
 const simulated=structuredClone(db),rows=[];
 for(const id of request.ids){
  const target=find(simulated.units,id,'Căn hộ');
  const before=structuredClone(target);
  // Moving to a building also selects its parent project. Moving only the project clears the old building link.
  const patch={...request.changes};
  if('projectId' in patch){patch.buildingId='';patch.building='';patch.floorId='';patch.roomId='';}
  if('buildingId' in patch){
   patch.building='';patch.floorId='';patch.roomId='';
   if(patch.buildingId){const nextBuilding=find(simulated.buildings,patch.buildingId,'Tòa nhà');patch.projectId=nextBuilding.projectId;}
  }
  if('floorId' in patch&&!('roomId' in request.changes))patch.roomId='';
  if('roomId' in patch&&!('floorId' in request.changes))patch.floorId='';
  const changed=cleanUnit(patch,simulated,target);
  const changedFee=changed.feePercent!==before.feePercent||changed.feeBasis!==before.feeBasis;
  const modifiedFields=[...BULK_UNIT_FIELDS,'building'].filter(key=>changed[key]!==before[key]);
  Object.assign(target,changed);
  if(modifiedFields.length)bumpUnitRevision(target);
  if(changedFee){
   applyUnitFeePolicy(simulated,{unitId:id,before,after:changed,effectiveFrom:request.effectiveFrom,reason:request.reason,actorId:'bulk-operation'});
  }
  rows.push({id,code:target.code||'(chưa có mã)',changedFields:modifiedFields,
   before:Object.fromEntries(modifiedFields.map(k=>[k,before[k]??null])),
   after:Object.fromEntries(modifiedFields.map(k=>[k,target[k]??null]))});
 }
 return {fingerprint:originalFingerprint,request,rows,simulated,changed:rows.filter(x=>x.changedFields.length>0).length};
}

export function commitBulkUnits(db,input,cleanUnit,actor,{day}){
 const computed=simulateBulkUnits(db,input,cleanUnit,{day});
 if(typeof input.fingerprint!=='string'||input.fingerprint!==computed.fingerprint)fail('Danh mục đã thay đổi kể từ khi xem trước. Hãy kiểm tra lại trước khi lưu.',409);
 const {simulated,rows}=computed;
 db.units=simulated.units;
 db.schedules=simulated.schedules;
 db.feeHistory=simulated.feeHistory.map(entry=>entry.changedBy==='bulk-operation'?{...entry,changedBy:actor.id}:entry);
 for(const row of rows.filter(x=>x.changedFields.length))log(db,actor,'unit.bulk_update',row.id,row.before,row.after);
 log(db,actor,'units.bulk_commit','batch',null,{count:computed.changed,requested:rows.length,fields:Object.keys(computed.request.changes)});
 return {updated:computed.changed,total:rows.length,rows};
}
