// Archive/restore flows preserve financial history; they are not hard deletes.
import {active,fail,find,log,samePersistedId} from './domain.js';
import {validateClientLink} from './client-validation.js';
import {checkUnitLocation} from './spatial-validation.js';
import {bumpRecordRevision} from './record-revisions.js';

export const ARCHIVABLE = Object.freeze({
 projects:{permission:'project.write',label:'Dự án'},
 buildings:{permission:'building.write',label:'Tòa nhà'},
 floors:{permission:'building.write',label:'Tầng'},
 rooms:{permission:'building.write',label:'Phòng'},
 units:{permission:'unit.write',label:'Căn hộ'},
 clients:{permission:'client.write',label:'Khách hàng'},
 staff:{permission:'staff.write',label:'Nhân viên'},
 leases:{permission:'lease.write',label:'Hợp đồng'}
});

export const archiveType=(collection)=>Object.hasOwn(ARCHIVABLE,collection)?ARCHIVABLE[collection]:null;

/** Shared dependency guard for archive/move operations; numeric/string IDs are equivalent. */
export function hasActiveLink(db,collection,field,id){
 return (db[collection]||[]).some(row=>active(row)&&samePersistedId(row[field],id));
}

export function archiveRecord(db,collection,id,actor){
 if(!archiveType(collection))fail('Loại hồ sơ không hỗ trợ lưu trữ',404);
 const row=find(db[collection],id,ARCHIVABLE[collection].label);
 if(collection==='clients'&&(db.leases||[]).some(lease=>lease.status==='active'&&samePersistedId(lease.tenantId,row.id)))
  fail('Khách hàng đang được liên kết với hợp đồng có hiệu lực. Cần đối soát hoặc chuyển liên kết trước khi lưu trữ.',409);
 const previous=structuredClone(row);
 row.archiveMeta={status:row.status||'active',archivedAt:new Date().toISOString(),archivedBy:actor?.id||'system'};
 row.status='archived';
 if(['units','clients','leases'].includes(collection))bumpRecordRevision(row);
 log(db,actor,`${collection}.archive`,row.id,previous,row);
 return {archived:true,id:row.id};
}

function requireActive(arr,id,label){
 if(id)find(arr,id,label);
}

export function restoreRecord(db,collection,id,actor){
 if(!archiveType(collection))fail('Loại hồ sơ không hỗ trợ khôi phục',404);
 const row=db[collection].find(v=>samePersistedId(v.id,id));
 if(!row)fail('Hồ sơ không tồn tại',404);
 if(row.status!=='archived')fail('Hồ sơ chưa được lưu trữ',409);
 const previous=structuredClone(row);
 if(collection==='projects'){
  if(row.name&&db.projects.some(v=>active(v)&&!samePersistedId(v.id,row.id)&&v.name?.toLowerCase()===row.name.toLowerCase()))fail('Tên dự án đang được sử dụng; cần đổi tên trước khi khôi phục',409);
 }
 if(collection==='buildings'){
  requireActive(db.projects,row.projectId,'Dự án cha');
  if(row.code&&db.buildings.some(v=>active(v)&&!samePersistedId(v.id,row.id)&&samePersistedId(v.projectId,row.projectId)&&v.code?.toLowerCase()===row.code.toLowerCase()))fail('Mã tòa đã tồn tại trong dự án',409);
 }
 if(collection==='floors'){
  requireActive(db.buildings,row.buildingId,'Tòa nhà cha');
  if(row.code&&db.floors.some(v=>active(v)&&!samePersistedId(v.id,row.id)&&samePersistedId(v.buildingId,row.buildingId)&&v.code?.toLowerCase()===row.code.toLowerCase()))fail('Mã tầng đã tồn tại trong tòa',409);
 }
 if(collection==='rooms'){
  requireActive(db.floors,row.floorId,'Tầng cha');
  if(row.code&&db.rooms.some(v=>active(v)&&!samePersistedId(v.id,row.id)&&samePersistedId(v.floorId,row.floorId)&&v.code?.toLowerCase()===row.code.toLowerCase()))fail('Mã phòng đã tồn tại trong tầng',409);
 }
 if(collection==='units'){
  requireActive(db.projects,row.projectId,'Dự án cha');
  requireActive(db.buildings,row.buildingId,'Tòa nhà cha');
  checkUnitLocation(row,db);
  if(row.buildingId){const b=find(db.buildings,row.buildingId,'Tòa nhà cha');if(row.projectId&&!samePersistedId(b.projectId,row.projectId))fail('Tòa nhà không thuộc dự án',409);}
  if(row.code&&db.units.some(v=>active(v)&&!samePersistedId(v.id,row.id)&&samePersistedId(v.projectId,row.projectId)&&(v.buildingId&&row.buildingId?samePersistedId(v.buildingId,row.buildingId):String(v.buildingId||v.building||'').trim()===String(row.buildingId||row.building||'').trim())&&v.code?.toLowerCase()===row.code.toLowerCase()))fail('Mã căn trùng trong dự án/tòa hiện tại',409);
  requireActive(db.staff,row.managerId,'Nhân viên phụ trách');
  requireActive(db.staff,row.saleId,'Nhân viên Sale');
  if(row.ownerId)validateClientLink(find(db.clients,row.ownerId,'Chủ sở hữu'),'owner');
  if(row.tenantId)validateClientLink(find(db.clients,row.tenantId,'Khách thuê'),'tenant');
 }
 if(collection==='leases'){
  requireActive(db.units,row.unitId,'Căn hộ');
  if(row.tenantId)validateClientLink(find(db.clients,row.tenantId,'Khách thuê'),'tenant');
  // Never silently activate a contract or recreate a payment schedule on restore.
 }
 const prior=row.archiveMeta?.status;
 row.status=collection==='units'?(prior==='occupied'?'draft':(['draft','vacant','ended'].includes(prior)?prior:'draft')):
  collection==='leases'?(prior==='ended'?'ended':'draft'):'active';
 row.restoredAt=new Date().toISOString();row.restoredBy=actor?.id||'system';
 if(['units','clients','leases'].includes(collection))bumpRecordRevision(row);
 log(db,actor,`${collection}.restore`,row.id,previous,row);
 return row;
}

export function archiveListing(db,canWrite){
 const rows=[];
 for(const [collection,config] of Object.entries(ARCHIVABLE)){
  if(!canWrite(config.permission))continue;
  for(const row of db[collection]||[]){if(row.status!=='archived')continue;
   rows.push({id:row.id,collection,label:config.label,name:row.name||row.code||row.tenantName||row.id,
    archivedAt:row.archiveMeta?.archivedAt||null,previousStatus:row.archiveMeta?.status||null,
    actorId:row.archiveMeta?.archivedBy||null});
  }
 }
 return rows.sort((a,b)=>(b.archivedAt||'').localeCompare(a.archivedAt||''));
}
