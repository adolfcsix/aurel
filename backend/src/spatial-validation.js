import {active,find,fail,text,samePersistedId} from './domain.js';

const same=(a,b)=>String(a||'').trim().toLocaleLowerCase('vi-VN')===String(b||'').trim().toLocaleLowerCase('vi-VN');
export function cleanFloor(input,db,current){
 const buildingId=text(input.buildingId,100),code=text(input.code,50),name=text(input.name,100),notes=text(input.notes,600);
 const building=buildingId?find(db.buildings,buildingId,'Tòa nhà'):null;
 if(current&&String(current.buildingId??'')!==String(buildingId??'')&&((db.rooms||[]).some(r=>active(r)&&samePersistedId(r.floorId,current.id))||db.units.some(u=>active(u)&&samePersistedId(u.floorId,current.id))))fail('Tầng đang có phòng hoặc căn liên kết; hãy chuyển các hồ sơ con trước',409);
 if(code&&(db.floors||[]).some(f=>active(f)&&!samePersistedId(f.id,current?.id)&&samePersistedId(f.buildingId,buildingId)&&same(f.code,code)))fail('Mã tầng bị trùng trong tòa',409);
 return {buildingId,projectId:building?.projectId||'',code,name,notes};
}
export function cleanRoom(input,db,current){
 const floorId=text(input.floorId,100),code=text(input.code,50),name=text(input.name,100),notes=text(input.notes,600);
 const floor=floorId?find(db.floors,floorId,'Tầng'):null;
 if(current&&String(current.floorId??'')!==String(floorId??'')&&db.units.some(u=>active(u)&&samePersistedId(u.roomId,current.id)))fail('Phòng đang có căn liên kết; hãy chuyển căn trước',409);
 if(code&&(db.rooms||[]).some(x=>active(x)&&!samePersistedId(x.id,current?.id)&&samePersistedId(x.floorId,floorId)&&same(x.code,code)))fail('Mã phòng bị trùng trong tầng',409);
 return {floorId,buildingId:floor?.buildingId||'',projectId:floor?.projectId||'',code,name,notes};
}
// A newly chosen location takes precedence over stale parent dropdown values.
// Explicitly selecting an incompatible floor AND room is still rejected.
export function syncLocationSelection(unit,input,previous,db){
 const changed=field=>field in input&&String(input[field]??'')!==String(previous?.[field]??'');
 const moveRoom=changed('roomId')&&!!unit.roomId,moveFloor=changed('floorId')&&!!unit.floorId;
 if(moveRoom){
  const room=find(db.rooms||[],unit.roomId,'Phòng');
  if(moveFloor&&!samePersistedId(unit.floorId,room.floorId))fail('Phòng không thuộc tầng đã chọn');
  unit.floorId=room.floorId;unit.buildingId=room.buildingId;unit.projectId=room.projectId;
 }else if(moveFloor){
  const floor=find(db.floors||[],unit.floorId,'Tầng');
  if(changed('buildingId')&&unit.buildingId&&!samePersistedId(unit.buildingId,floor.buildingId))fail('Tầng không thuộc tòa đã chọn');
  unit.roomId='';unit.room='';unit.buildingId=floor.buildingId;unit.projectId=floor.projectId;
 }else if(changed('floorId')){
  // A partial API update must not silently restore a just-cleared floor from an old room.
  unit.roomId='';unit.room='';unit.floor='';
 }else if(changed('buildingId')){
  unit.floorId='';unit.roomId='';unit.floor='';unit.room='';
  const building=unit.buildingId?find(db.buildings,unit.buildingId,'Tòa nhà'):null;
  unit.building=building?.code||building?.name||'';
  if(building)unit.projectId=building.projectId;
 }else if(changed('projectId')){
  unit.buildingId='';unit.floorId='';unit.roomId='';
  unit.building='';unit.floor='';unit.room='';
 }else if(changed('roomId')){
  // Clearing just the room preserves the chosen floor, without retaining its obsolete label.
  unit.room='';
 }
 return unit;
}
export function checkUnitLocation(unit,db){
 if(unit.roomId){
  const room=find(db.rooms||[],unit.roomId,'Phòng');
  if(unit.floorId&&!samePersistedId(unit.floorId,room.floorId))fail('Phòng không thuộc tầng đã chọn');
  unit.floorId=room.floorId;
 }
 if(unit.floorId){
  const floor=find(db.floors||[],unit.floorId,'Tầng');
  if(unit.buildingId&&!samePersistedId(unit.buildingId,floor.buildingId))fail('Tầng không thuộc tòa đã chọn');
  unit.buildingId=floor.buildingId;
  unit.floor=floor.code||floor.name||'';
 }
 if(unit.roomId){const room=find(db.rooms||[],unit.roomId,'Phòng');unit.room=room.code||room.name||'';}
 // Building and project consistency is validated by the normal unit validator.
 return unit;
}
