// Canonical unit validation shared by single-record CRUD and batch edits.
import {vnd,percent,number,text,find,validateDate,fail,active,samePersistedId} from './domain.js';
import {validateClientLink} from './client-validation.js';
import {checkUnitLocation,syncLocationSelection} from './spatial-validation.js';
const unitFields=['code','projectId','buildingId','building','floorId','roomId','floor','room','address','interiorStatus','interiorNotes','owner','tenant','ownerId','tenantId','managerId','saleId','notes','leaseStart','leaseEnd','feeBasis','status','area','bedrooms','rent','renewalRent','feePercent','deposit','paymentDay'];
export function cleanUnit(input,db,old){let u={...old};for(const key of unitFields){if(!(key in input))continue;const val=input[key];
 if(['rent','renewalRent','deposit'].includes(key))u[key]=vnd(val,key);
 else if(key==='feePercent')u[key]=percent(val);
 else if(['area','bedrooms'].includes(key)){
  const n=number(val,key,10000);
  if(key==='bedrooms'&&n!==null&&!Number.isInteger(n))fail('Số phòng ngủ phải là số nguyên');
  u[key]=n;
 }
 else if(key==='paymentDay'){const d=number(val,key,31);if(d!==null&&(!Number.isInteger(d)||d<1))fail('Ngày thanh toán từ 1 đến 31');u[key]=d}
 else u[key]=text(val,key==='notes'?1500:key==='interiorNotes'?1000:300);
 }
 syncLocationSelection(u,input,old,db);
 checkUnitLocation(u,db);
 if(!['','unfurnished','partial','furnished'].includes(u.interiorStatus||''))fail('Tình trạng nội thất không hợp lệ');
 if(u.projectId)find(db.projects,u.projectId,'Dự án');if(u.buildingId){const b=find(db.buildings,u.buildingId,'Tòa nhà');if(u.projectId&&!samePersistedId(b.projectId,u.projectId))fail('Tòa nhà không thuộc dự án');if(!u.projectId)u.projectId=b.projectId;u.building=b.code||b.name||'';}
 for(const field of ['managerId','saleId'])if(u[field])find(db.staff,u[field],'Nhân viên');
 if(u.ownerId)validateClientLink(find(db.clients,u.ownerId,'Chủ sở hữu'),'owner');if(u.tenantId)validateClientLink(find(db.clients,u.tenantId,'Khách thuê'),'tenant');
 if(!['draft','vacant','occupied','ended'].includes(u.status))fail('Trạng thái căn không hợp lệ');
 if(!['due','paid'].includes(u.feeBasis))fail('Cơ sở tính phí không hợp lệ');
 validateDate(u.leaseStart,'Ngày bắt đầu');validateDate(u.leaseEnd,'Ngày kết thúc');
 if(u.leaseStart&&u.leaseEnd&&u.leaseStart>u.leaseEnd)fail('Ngày hợp đồng bị đảo');
 if(u.code&&db.units.some(v=>!samePersistedId(v.id,old?.id)&&active(v)&&samePersistedId(v.projectId,u.projectId)&&(v.buildingId&&u.buildingId?samePersistedId(v.buildingId,u.buildingId):String(v.buildingId||v.building||'').trim()===String(u.buildingId||u.building||'').trim())&&v.code.toLowerCase()===u.code.toLowerCase()))fail('Mã căn bị trùng trong dự án và tòa');return u;
}
