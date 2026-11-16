import {sameDossierId,findDossierRow} from './dossier-id.js';
/** Presentation-only grouping for large editable records. Schema and backend
 * validation remain unchanged: empty optional fields are still permitted. */
const layouts={
 unit:[
  {title:'Định danh & vị trí',note:'Xác định căn hộ trong danh mục; có thể bổ sung tòa, tầng và địa chỉ sau.',keys:['code','projectId','buildingId','building','floorId','roomId','floor','room','address']},
  {title:'Không gian & tình trạng',note:'Thông tin mô tả và trạng thái khai thác.',keys:['area','bedrooms','interiorStatus','interiorNotes','status']},
  {title:'Chủ sở hữu & phân công',note:'Liên kết chủ sở hữu, khách thuê và người phụ trách.',keys:['ownerId','owner','tenantId','tenant','managerId','saleId']},
  {title:'Giá thuê & chính sách phí',note:'Thay đổi tỷ lệ phí có ngày hiệu lực; kỳ đã chốt không bị tính lại.',keys:['rent','renewalRent','feePercent','feeBasis','deposit','feeEffectiveFrom','feeReason']},
  {title:'Thời hạn & ghi chú',note:'Thông tin tham khảo; lịch thu chính thức được tạo theo hợp đồng.',keys:['leaseStart','leaseEnd','paymentDay','notes']}
 ],
 lease:[
  {title:'Căn hộ & người thuê',note:'Thông tin các bên trong hợp đồng.',keys:['unitId','tenantName','tenantId','status']},
  {title:'Điều khoản thời gian',note:'Kỳ thu được tính từ ngày bắt đầu và ngày kết thúc.',keys:['startsOn','endsOn','paymentDay']},
  {title:'Giá thuê & đặt cọc',note:'Số tiền cọc theo hợp đồng được theo dõi riêng với doanh thu thuê.',keys:['rent','depositExpected']},
  {title:'Ghi chú hồ sơ',note:'Không bắt buộc ở bản nháp.',keys:['notes']}
 ],
 staff:[
  {title:'Thông tin nhân sự',note:'Hồ sơ dùng cho phân công và theo dõi trách nhiệm.',keys:['name','short','role','phone','email']},
  {title:'Ghi chú',note:'Có thể bổ sung về sau.',keys:['notes']}
 ]
};
export function groupEditorFields(kind,fields){
 const blueprint=layouts[kind];if(!blueprint)return null;
 const used=new Set();
 const groups=blueprint.map(section=>({...section,fields:section.keys.map(key=>fields.find(x=>x.name===key)).filter(Boolean).filter(x=>{used.add(x.name);return true})})).filter(group=>group.fields.length);
 const remaining=fields.filter(f=>!used.has(f.name));
 if(remaining.length)groups.push({title:'Thông tin bổ sung',note:'Các trường mở rộng khác.',fields:remaining});
 return groups;
}


/** Restrict each location selector to the current portfolio hierarchy.
 * Existing records with absent parents remain editable in their original form,
 * and choosing a registered child updates ancestor selectors explicitly. */
export function scopedUnitLocationField(field,data,draft){
 if(!['buildingId','floorId','roomId'].includes(field.name))return field;
 const project=draft.projectId,building=draft.buildingId,floor=draft.floorId;
 const projectForFloor=f=>f.projectId||findDossierRow(data.buildings,f.buildingId)?.projectId;
 const parentFloor=r=>findDossierRow(data.floors,r.floorId);
 const projectForRoom=r=>r.projectId||projectForFloor(parentFloor(r)||{});
 let candidates;
 if(field.name==='buildingId')candidates=(data.buildings||[]).filter(b=>!project||sameDossierId(b.projectId,project));
 else if(field.name==='floorId')candidates=(data.floors||[]).filter(f=>building?sameDossierId(f.buildingId,building):(!project||sameDossierId(projectForFloor(f),project)));
 else candidates=(data.rooms||[]).filter(r=>floor?sameDossierId(r.floorId,floor):building?sameDossierId(r.buildingId||parentFloor(r)?.buildingId,building):(!project||sameDossierId(projectForRoom(r),project)));
 const allowed=new Set(candidates.map(row=>String(row.id).trim()));
 const all=field.options||[];
 const visible=all.filter(option=>allowed.has(String(option.value).trim()));
 // Historical records can reference a child whose parent was moved, archived or
 // imported without a full hierarchy. Do not visually replace a saved value
 // with the blank placeholder while the manager edits an unrelated field.
 // Changing the parent clears its descendants via changeUnitLocationDraft.
 const selected=draft[field.name];
 if(selected!==null&&selected!==undefined&&String(selected).trim()&&
    !visible.some(option=>sameDossierId(option.value,selected))){
  const legacy=all.find(option=>sameDossierId(option.value,selected));
  visible.unshift({value:selected,label:legacy
   ?`${legacy.label} — cần đối chiếu vị trí`
   :`Liên kết cũ (${String(selected).slice(0,40)}) — không còn trong danh mục`});
  return {...field,options:visible,help:[field.help,'Liên kết đang lưu chưa phù hợp danh mục hiện tại. Chọn lại vị trí nếu cần; hồ sơ chưa được tự sửa.'].filter(Boolean).join(' ')};
 }
 return {...field,options:visible};
}

/** Prevent stale child locations from being submitted with a newly selected parent.
 * The API is still the authority for hierarchy validation and persistence. */
export function changeUnitLocationDraft(draft,name,value,data){
 const next={...draft,[name]:value};
 if(!['projectId','buildingId','floorId','roomId'].includes(name)||String(draft[name]??'')===String(value??''))return next;
 const clear=(...keys)=>{for(const key of keys)next[key]=''};
 if(name==='projectId')clear('buildingId','floorId','roomId','building','floor','room');
 if(name==='buildingId'){
  clear('floorId','roomId','floor','room');
  const b=findDossierRow(data.buildings,value);
  next.building=b?.code||b?.name||'';
  if(b)next.projectId=b.projectId||'';
 }
 if(name==='floorId'){
  clear('roomId','room');
  const f=findDossierRow(data.floors,value);
  if(f){
   const b=findDossierRow(data.buildings,f.buildingId);
   next.buildingId=f.buildingId||'';next.projectId=f.projectId||b?.projectId||'';
   next.building=b?.code||b?.name||'';next.floor=f.code||f.name||'';
  } else next.floor='';
 }
 if(name==='roomId'){
  const r=findDossierRow(data.rooms,value);
  if(r){
   const f=findDossierRow(data.floors,r.floorId);
   const b=findDossierRow(data.buildings,r.buildingId||f?.buildingId);
   next.floorId=r.floorId||'';next.buildingId=r.buildingId||f?.buildingId||'';
   next.projectId=r.projectId||f?.projectId||b?.projectId||'';
   next.building=b?.code||b?.name||'';next.floor=f?.code||f?.name||'';
   next.room=r.code||r.name||'';
  } else next.room='';
 }
 return next;
}


/** Keep a historical link visible while an existing dossier is edited.
 * Only the value that was already persisted is retained, never a new invalid
 * choice. The API still decides whether the old link is acceptable on save.
 */
export function retainSavedEditorLink(field,savedValue,currentValue){
 if(field.type!=='select'||savedValue===null||savedValue===undefined||!String(savedValue).trim())return field;
 if(String(currentValue??'')!==String(savedValue))return field;
 if((field.options||[]).some(option=>sameDossierId(option.value,savedValue)))return field;
 const safeId=String(savedValue).slice(0,48);
 return {...field,
  options:[{value:savedValue,label:`Liên kết đang lưu (${safeId}) — cần đối chiếu`},...(field.options||[])],
  help:[field.help,'Liên kết lịch sử không có trong danh sách hợp lệ hiện tại. Hãy đối chiếu hồ sơ trước khi lưu.'].filter(Boolean).join(' ')};
}
