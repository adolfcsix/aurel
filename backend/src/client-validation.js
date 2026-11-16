/**
 * Centralized client-role validation. The same person may be both owner and
 * tenant, but role changes must not invalidate live OR archived unit history.
 * Incomplete customer records remain allowed until they are linked to a unit.
 */
import {active,fail,text,samePersistedId} from './domain.js';

export function cleanClient(input,db,current){
 const type=text(input.type||'owner',20);
 if(!['owner','tenant','both'].includes(type))fail('Loại khách hàng không hợp lệ');
 if(current){
  const units=db.units||[];
  if(type==='tenant'&&units.some(u=>samePersistedId(u.ownerId,current.id)))
   fail('Khách hàng đang đứng tên chủ sở hữu của căn hộ. Hãy chuyển chủ sở hữu trước khi đổi vai trò.',409);
  if(type==='owner'&&units.some(u=>samePersistedId(u.tenantId,current.id)))
   fail('Khách hàng đang là khách thuê của căn hộ. Hãy chuyển khách thuê trước khi đổi vai trò.',409);
  if(type==='owner'&&(db.leases||[]).some(lease=>samePersistedId(lease.tenantId,current.id)))
   fail('Hồ sơ này đã được liên kết là khách thuê trong hợp đồng. Hãy chuyển liên kết hợp đồng trước khi đổi vai trò.',409);
 }
 return {
  name:text(input.name,160),code:text(input.code,80),type,
  phone:text(input.phone,40),email:text(input.email,160),
  address:text(input.address,240),notes:text(input.notes,1200)
 };
}

export function validateClientLink(client,role){
 if(!active(client))fail('Khách hàng đã được lưu trữ',404);
 // Legacy records created before role classification may lack `type`. Keep
 // historical links restorable; Data Quality flags these for completion.
 if(!client.type)return client;
 const accepted=role==='owner'?['owner','both']:['tenant','both'];
 if(!accepted.includes(client.type))fail(role==='owner'
  ?'Hồ sơ khách hàng không có vai trò chủ sở hữu'
  :'Hồ sơ khách hàng không có vai trò khách thuê',409);
 return client;
}
