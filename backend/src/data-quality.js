/**
 * Read-only data integrity checks for imported, draft and historical records.
 * Missing optional draft fields are intentionally not considered errors.
 * Results contain record identifiers, not customer contact details.
 */
import {active,paidFor,depositBalance,dateOk,samePersistedId} from './domain.js';

const info={project:'projects',building:'projects',unit:'units',lease:'leases',schedule:'payments',payment:'payments',deposit:'deposits',fee:'fees',staff:'staff'};
export function scanDataQuality(db,{limit=200}={}){
 const all=[];
 const add=(severity,code,kind,id,description)=>all.push({key:`${code}:${kind}:${id}`,severity,code,kind,id:String(id??''),description,section:info[kind]||'units'});
 const idKey=id=>id==null?'':String(id).trim();
 const live=(collection,id)=>!idKey(id)||db[collection]?.some(x=>samePersistedId(x.id,id)&&active(x));
 const units=(db.units||[]).filter(active),leases=(db.leases||[]).filter(active),schedules=(db.schedules||[]);
 const unitIds=new Map((db.units||[]).map(u=>[idKey(u.id),u]));
 const leasesById=new Map((db.leases||[]).map(l=>[idKey(l.id),l]));
 const seenUnits=new Map(),seenPeriods=new Map(),seenKeys=new Map();
 const depositKeys=new Map(),settlementReferences=new Map();
 for(const b of (db.buildings||[]).filter(active)){
  if(b.projectId&&!live('projects',b.projectId))add('critical','MISSING_PROJECT','building',b.id,'Tòa nhà liên kết với dự án không còn hoạt động.');
 }
 for(const floor of (db.floors||[]).filter(active)){
  const b=(db.buildings||[]).find(x=>samePersistedId(x.id,floor.buildingId)&&active(x));
  if(floor.buildingId&&!b)add('critical','FLOOR_MISSING_BUILDING','building',floor.id,'Tầng tham chiếu tòa nhà không còn hoạt động.');
  if(b&&floor.projectId&&!samePersistedId(b.projectId,floor.projectId))add('warning','FLOOR_PROJECT_MISMATCH','building',floor.id,'Dự án của tầng không khớp tòa nhà.');
 }
 for(const room of (db.rooms||[]).filter(active)){
  const floor=(db.floors||[]).find(x=>samePersistedId(x.id,room.floorId)&&active(x));
  if(room.floorId&&!floor)add('critical','ROOM_MISSING_FLOOR','building',room.id,'Phòng tham chiếu tầng không còn hoạt động.');
  if(floor&&room.buildingId&&!samePersistedId(floor.buildingId,room.buildingId))add('warning','ROOM_BUILDING_MISMATCH','building',room.id,'Tòa của phòng không khớp tầng.');
 }
 for(const u of units){
  if(u.projectId&&!live('projects',u.projectId))add('critical','MISSING_PROJECT','unit',u.id,'Căn hộ đang tham chiếu dự án không tồn tại hoặc đã lưu trữ.');
  if(u.buildingId){const b=(db.buildings||[]).find(b=>samePersistedId(b.id,u.buildingId)&&active(b));
   if(!b)add('critical','MISSING_BUILDING','unit',u.id,'Căn hộ tham chiếu tòa nhà không còn hoạt động.');
   else if(u.projectId&&!samePersistedId(u.projectId,b.projectId))add('critical','BUILDING_PROJECT_MISMATCH','unit',u.id,'Dự án của căn hộ khác với dự án của tòa nhà.');
  }
  if(u.floorId){const floor=(db.floors||[]).find(f=>samePersistedId(f.id,u.floorId)&&active(f));if(!floor)add('critical','MISSING_FLOOR','unit',u.id,'Căn hộ liên kết với tầng không tồn tại hoặc đã lưu trữ.');else if(u.buildingId&&!samePersistedId(floor.buildingId,u.buildingId))add('critical','FLOOR_BUILDING_MISMATCH','unit',u.id,'Tầng và tòa được liên kết không khớp.');}
  if(u.roomId){const room=(db.rooms||[]).find(r=>samePersistedId(r.id,u.roomId)&&active(r));if(!room)add('critical','MISSING_ROOM','unit',u.id,'Căn hộ liên kết với phòng không tồn tại hoặc đã lưu trữ.');else if(u.floorId&&!samePersistedId(room.floorId,u.floorId))add('critical','ROOM_FLOOR_MISMATCH','unit',u.id,'Phòng và tầng được liên kết không khớp.');}
  if(u.interiorStatus&&!['unfurnished','partial','furnished'].includes(u.interiorStatus))add('warning','UNKNOWN_INTERIOR','unit',u.id,'Tình trạng nội thất không thuộc danh mục hợp lệ.');
  for(const k of ['managerId','saleId'])if(u[k]&&!live('staff',u[k]))add('warning','INACTIVE_STAFF','unit',u.id,'Nhân viên được phân công không còn là hồ sơ đang hoạt động.');
  for(const k of ['ownerId','tenantId'])if(u[k]&&!live('clients',u[k]))add('warning','INACTIVE_CLIENT','unit',u.id,'Hồ sơ khách hàng liên kết đã bị lưu trữ hoặc không tồn tại.');
  const owner=(db.clients||[]).find(c=>samePersistedId(c.id,u.ownerId)&&active(c));
  const tenant=(db.clients||[]).find(c=>samePersistedId(c.id,u.tenantId)&&active(c));
  if(owner&&!owner.type)add('warning','UNCLASSIFIED_OWNER','unit',u.id,'Chủ sở hữu thiếu phân loại vai trò; hãy bổ sung hồ sơ khách hàng.');
  else if(owner&&!['owner','both'].includes(owner.type))add('warning','OWNER_ROLE_MISMATCH','unit',u.id,'Khách hàng đứng tên chủ sở hữu không có vai trò phù hợp.');
  if(tenant&&!tenant.type)add('warning','UNCLASSIFIED_TENANT','unit',u.id,'Khách thuê thiếu phân loại vai trò; hãy bổ sung hồ sơ khách hàng.');
  else if(tenant&&!['tenant','both'].includes(tenant.type))add('warning','TENANT_ROLE_MISMATCH','unit',u.id,'Khách hàng đứng tên khách thuê không có vai trò phù hợp.');
  if(u.code?.trim()){
   const key=[idKey(u.projectId),idKey(u.buildingId)||u.building||'',u.code.trim().toLowerCase()].join('|');
   const other=seenUnits.get(key);if(other)add('critical','DUPLICATE_UNIT','unit',u.id,`Mã căn trùng với căn hộ ${other} trong cùng dự án/tòa.`);else seenUnits.set(key,u.id);
  }
  if(u.feePercent!=null&&(!Number.isFinite(Number(u.feePercent))||u.feePercent<0||u.feePercent>100))add('critical','INVALID_FEE','unit',u.id,'Tỷ lệ phí quản lý ngoài khoảng hợp lệ 0–100%.');
 }
 for(const l of leases){
  if(l.tenantId){
   const tenant=(db.clients||[]).find(c=>samePersistedId(c.id,l.tenantId));
   if(!tenant||!active(tenant))add(l.status==='active'?'critical':'warning','LEASE_TENANT_REFERENCE','lease',l.id,'Hợp đồng có mã khách thuê không tồn tại hoặc đã được lưu trữ.');
   else if(tenant.type&&!['tenant','both'].includes(tenant.type))add('warning','LEASE_TENANT_ROLE','lease',l.id,'Khách thuê được liên kết không có vai trò phù hợp.');
  }
  if(l.unitId&&!unitIds.has(idKey(l.unitId)))add('critical','MISSING_UNIT','lease',l.id,'Hợp đồng tham chiếu căn hộ không còn hoạt động.');
  if(l.status==='active'){
   if(!l.unitId||!l.startsOn||!l.endsOn||l.rent==null)add('critical','INCOMPLETE_ACTIVE_LEASE','lease',l.id,'Hợp đồng đang hoạt động thiếu dữ liệu bắt buộc.');
   if(l.startsOn&&l.endsOn&&l.startsOn>l.endsOn)add('critical','REVERSED_LEASE_DATES','lease',l.id,'Ngày bắt đầu hợp đồng muộn hơn ngày kết thúc.');
   if(l.unitId){
    // Compare previously encountered leases, not opaque ID ordering: UUID/text/numeric IDs
    // do not have a meaningful greater-than relationship.
    const overlap=leases.slice(0,leases.indexOf(l)).find(p=>p.status==='active'&&samePersistedId(p.unitId,l.unitId)&&p.startsOn&&p.endsOn&&l.startsOn&&l.endsOn&&p.startsOn<=l.endsOn&&p.endsOn>=l.startsOn);
    if(overlap)add('critical','OVERLAPPING_LEASE','lease',l.id,`Hợp đồng chồng thời gian với ${overlap.id}.`);
   }
  }
 }
 for(const s of schedules){
  if(s.status==='archived')continue;
  const lease=leasesById.get(idKey(s.leaseId));
  if(!lease)add('critical','MISSING_LEASE','schedule',s.id,'Kỳ thu tham chiếu hợp đồng không còn hoạt động.');
  if(!unitIds.has(idKey(s.unitId)))add('critical','MISSING_UNIT','schedule',s.id,'Kỳ thu tham chiếu căn hộ không còn hoạt động.');
  if(lease&&!samePersistedId(s.unitId,lease.unitId))add('critical','LEASE_UNIT_MISMATCH','schedule',s.id,'Căn hộ trong kỳ thu không khớp hợp đồng.');
  if(!Number.isSafeInteger(s.amount)||s.amount<0)add('critical','INVALID_AMOUNT','schedule',s.id,'Tiền phải thu không hợp lệ hoặc không phải số nguyên VND.');
  if(s.dueOn&&!dateOk(s.dueOn))add('critical','INVALID_DUE_DATE','schedule',s.id,'Ngày phải thu không hợp lệ.');
  const total=paidFor(db,s.id);
  if(total>s.amount)add('critical','OVERPAID_SCHEDULE','schedule',s.id,'Số tiền ghi nhận vượt số phải thu của kỳ.');
  if(s.status==='cancelled'&&total>0)add('critical','PAID_CANCELLED_SCHEDULE','schedule',s.id,'Kỳ đã hủy nhưng vẫn còn khoản thu đang có hiệu lực.');
  const key=`${s.leaseId}|${s.period}`;if(seenPeriods.has(key))add('critical','DUPLICATE_SCHEDULE','schedule',s.id,`Trùng kỳ thu với ${seenPeriods.get(key)}.`);else seenPeriods.set(key,s.id);
  if(s.feePercent!=null&&(s.feePercent<0||s.feePercent>100))add('critical','INVALID_FEE_SNAPSHOT','schedule',s.id,'Tỷ lệ phí của kỳ thu ngoài 0–100%.');
 }
 for(const p of db.payments||[]){
  const s=schedules.find(s=>samePersistedId(s.id,p.scheduleId));
  if(!s)add('critical','ORPHAN_PAYMENT','payment',p.id,'Giao dịch không liên kết được với kỳ thu.');
  if(s&&(!samePersistedId(p.leaseId,s.leaseId)||!samePersistedId(p.unitId,s.unitId)))add('critical','PAYMENT_LINK_MISMATCH','payment',p.id,'Giao dịch không khớp hợp đồng/căn hộ của kỳ thu.');
  if(!Number.isSafeInteger(p.amount)||p.amount<=0)add('critical','INVALID_PAYMENT','payment',p.id,'Số tiền giao dịch phải là số nguyên VND dương.');
  if(p.idempotencyKey){const other=seenKeys.get(p.idempotencyKey);if(other)add('critical','REUSED_PAYMENT_KEY','payment',p.id,`Khóa giao dịch trùng với ${other}.`);else seenKeys.set(p.idempotencyKey,p.id);}
 }
 for(const l of leases){
  const balance=depositBalance(db,l.id);
  if(balance<0)add('critical','NEGATIVE_DEPOSIT','deposit',l.id,'Số dư cọc đang âm; cần đối soát trước khi quyết toán.');
  if((db.depositSettlements||[]).some(p=>samePersistedId(p.leaseId,l.id)&&p.status==='approved'&&p.refund+p.deduction>balance))add('warning','STALE_DEPOSIT_APPROVAL','deposit',l.id,'Đề nghị hoàn cọc đã duyệt lớn hơn số dư hiện tại.');
 }
 for(const t of db.depositTransactions||[]){
  // V2.55 and earlier may have synthesized 'received' cash from a unit's
  // expected deposit during JSON upgrade. Flag for manual evidence review;
  // never rewrite or delete a financial transaction automatically.
  if(t.kind==='receive'&&t.note==='Số dư đầu kỳ từ dữ liệu mẫu')
   add('warning','UNVERIFIED_LEGACY_DEPOSIT','deposit',t.id,
    'Phiên bản cũ có thể đã tự tạo khoản nhận cọc từ giá trị tham khảo; cần đối chiếu chứng từ và xác nhận số dư trước khi sử dụng.');
  if(!leasesById.has(idKey(t.leaseId)))add('critical','ORPHAN_DEPOSIT','deposit',t.id,'Giao dịch cọc tham chiếu hợp đồng không tồn tại.');
  if(!['receive','settle'].includes(t.kind)||!Number.isSafeInteger(t.amount)||t.amount<=0)
   add('critical','INVALID_DEPOSIT_TRANSACTION','deposit',t.id,'Loại hoặc số tiền giao dịch cọc không hợp lệ.');
  if(t.idempotencyKey){const original=depositKeys.get(t.idempotencyKey);
   if(original)add('critical','REUSED_DEPOSIT_KEY','deposit',t.id,`Khóa nhận cọc trùng với giao dịch ${original}.`);
   else depositKeys.set(t.idempotencyKey,t.id);
  }
  if(t.kind==='settle'){
   if(!t.proposalId)add('warning','LEGACY_SETTLEMENT_WITHOUT_PROPOSAL','deposit',t.id,'Giao dịch hoàn cọc không có liên kết đề nghị; cần rà soát hồ sơ lịch sử.');
   if(t.reference){const original=settlementReferences.get(t.reference);
    if(original)add('critical','DUPLICATE_SETTLEMENT_REFERENCE','deposit',t.id,`Mã chứng từ hoàn cọc trùng với ${original}.`);
    else settlementReferences.set(t.reference,t.id);
   }else add('warning','MISSING_SETTLEMENT_REFERENCE','deposit',t.id,'Giao dịch hoàn cọc không có mã chứng từ.');
  }
 }
 for(const proposal of db.depositSettlements||[]){
  if(!leasesById.has(idKey(proposal.leaseId)))add('critical','ORPHAN_DEPOSIT_PROPOSAL','deposit',proposal.id,'Đề nghị hoàn cọc không có hợp đồng liên kết.');
  if(!['pending','approved','rejected','executed'].includes(proposal.status))add('critical','INVALID_DEPOSIT_PROPOSAL','deposit',proposal.id,'Trạng thái đề nghị hoàn cọc không hợp lệ.');
  if(!Number.isSafeInteger(proposal.refund)||proposal.refund<0||!Number.isSafeInteger(proposal.deduction)||proposal.deduction<0)
   add('critical','INVALID_DEPOSIT_PROPOSAL_AMOUNT','deposit',proposal.id,'Tiền hoàn hoặc tiền đối trừ không hợp lệ.');
  if(proposal.status==='executed'){
   const linked=(db.depositTransactions||[]).filter(t=>t.kind==='settle'&&samePersistedId(t.proposalId,proposal.id));
   if(linked.length!==1)add('critical','SETTLEMENT_TRANSACTION_COUNT','deposit',proposal.id,'Đề nghị đã thực hiện phải có đúng một giao dịch hoàn cọc.');
   else if(!samePersistedId(linked[0].leaseId,proposal.leaseId)||linked[0].amount!==proposal.refund+proposal.deduction||
     linked[0].refund!==proposal.refund||linked[0].deduction!==proposal.deduction||
     (proposal.transactionId&&!samePersistedId(proposal.transactionId,linked[0].id)))
    add('critical','SETTLEMENT_AMOUNT_MISMATCH','deposit',proposal.id,'Số tiền hoặc liên kết biên nhận hoàn cọc không khớp đề nghị được duyệt.');
  }
 }
 for(const attachment of db.paymentAttachments||[]){
  if(!(db.payments||[]).some(payment=>samePersistedId(payment.id,attachment.paymentId)))
   add('critical','ORPHAN_PAYMENT_ATTACHMENT','payment',attachment.id,'Chứng từ đính kèm không có giao dịch thu tiền tương ứng.');
 }

 for(const h of db.feeHistory||[]){if(!unitIds.has(idKey(h.unitId)))add('warning','ORPHAN_FEE_POLICY','fee',h.id,'Lịch sử tỷ lệ phí tham chiếu căn hộ không còn hoạt động.');if(h.effectiveFrom&&!dateOk(h.effectiveFrom))add('critical','INVALID_EFFECTIVE_DATE','fee',h.id,'Ngày hiệu lực chính sách phí không hợp lệ.');}
 const rank={critical:0,warning:1,info:2};all.sort((a,b)=>rank[a.severity]-rank[b.severity]||a.code.localeCompare(b.code)||a.id.localeCompare(b.id));
 return {checkedAt:new Date().toISOString(),summary:{critical:all.filter(x=>x.severity==='critical').length,warning:all.filter(x=>x.severity==='warning').length,total:all.length,units:units.length,leases:leases.length,schedules:schedules.length},issues:all.slice(0,Math.max(1,Math.min(1000,Number(limit)||200))),truncated:all.length>limit};
}
