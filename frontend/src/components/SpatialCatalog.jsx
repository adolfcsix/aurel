import React from 'react';
import {Icon,Btn} from './Ui.jsx';
import {portfolioHierarchy} from '../lib/portfolio-hierarchy.js';

function Op({title,name,record,onOpen,onArchive}){return <div className="spatial-actions"><button className="aurel-icon-action" type="button" title={'Sửa '+title} aria-label={'Sửa '+title} onClick={()=>onOpen(name,record)}><Icon name="edit" size={15}/></button><button className="aurel-icon-action" type="button" title={'Lưu trữ '+title} aria-label={'Lưu trữ '+title} onClick={()=>onArchive(name,record)}><Icon name="archive" size={15}/></button></div>}
export default function SpatialCatalog({data,can,onOpen,onArchive,onShowUnits,onOpenDossier}){
 const hierarchy=portfolioHierarchy(data);
 const {projects,unassigned}=hierarchy;
 const orphanBuildings=unassigned.buildings,orphanFloors=unassigned.floors,orphanRooms=unassigned.rooms;
 const floorsFor=hierarchy.floorsFor,roomsFor=hierarchy.roomsFor;
 const counts=id=>{const view=hierarchy.project(id);return {building:view.buildings.length,floor:view.floors.length,room:view.rooms.length,units:view.units.length};};
 return <div className="spatial-catalog">
  {projects.map(project=>{const c=counts(project.id),children=hierarchy.buildingsFor(project.id);return <section className="panel spatial-project" key={project.id}>
   <header className="spatial-project-head"><div><span className="eyebrow">CẤU TRÚC DANH MỤC</span><h3>{project.name||'Dự án chưa đặt tên'}</h3><p>{project.address||project.city||'Địa chỉ chưa cập nhật'}</p></div>{can('project.write')&&<Op title="dự án" name="project" record={project} onOpen={onOpen} onArchive={onArchive}/>}</header>
   <div className="aurel-spatial-dossier-action"><Btn kind="outline" intent="navigate" icon="arrowRight" onClick={()=>onOpenDossier?.(project.id)}>Xem hồ sơ dự án</Btn></div><div className="spatial-counts"><span><b>{c.building}</b> tòa nhà</span><span><b>{c.floor}</b> tầng</span><span><b>{c.room}</b> phòng</span><span><b>{c.units}</b> căn hộ</span></div>
   <div className="spatial-building-list">{children.map(building=><div className="spatial-building" key={building.id}>
    <div className="spatial-building-heading"><b><Icon name="building" size={17}/> {building.code||building.name||'Tòa nhà chưa đặt tên'}</b>{can('building.write')&&<Op title="tòa" name="building" record={building} onOpen={onOpen} onArchive={onArchive}/>}</div>
    <div className="spatial-floor-list">{floorsFor(building.id).map(floor=><div className="spatial-floor" key={floor.id}>
     <div className="spatial-floor-head"><span><b>Tầng {floor.code||floor.name||'chưa đặt tên'}</b><small>{roomsFor(floor.id).length} phòng</small></span>{can('building.write')&&<Op title="tầng" name="floor" record={floor} onOpen={onOpen} onArchive={onArchive}/>}</div>
     <div className="spatial-room-list">{roomsFor(floor.id).map(room=><div key={room.id} className="spatial-room"><span>{room.code||room.name||'Phòng chưa đặt tên'}</span>{can('building.write')&&<Op title="phòng" name="room" record={room} onOpen={onOpen} onArchive={onArchive}/>}</div>)}{!roomsFor(floor.id).length&&<small>Chưa lập danh mục phòng</small>}</div>
    </div>)}{!floorsFor(building.id).length&&<p className="spatial-empty">Chưa có tầng liên kết.</p>}</div>
   </div>)}{!children.length&&<div className="spatial-empty">Dự án chưa có tòa nhà.</div>}</div>
   <div className="spatial-open-units"><Btn kind="outline" intent="navigate" icon="arrowRight" onClick={()=>onShowUnits(project.id)}>Danh sách căn hộ</Btn></div>
  </section>})}
  {!projects.length&&<div className="panel spatial-empty">Chưa có dự án trong danh mục.</div>}
  {(orphanBuildings.length||orphanFloors.length||orphanRooms.length)&&<section className="panel spatial-unassigned"><h3>Hồ sơ chưa phân loại</h3><p>Các hồ sơ chưa có liên kết định danh với vị trí cha.</p>{orphanBuildings.map(b=><div className="spatial-room" key={b.id}><span>Tòa nhà {b.code||b.name||'chưa đặt tên'}</span>{can('building.write')&&<Op title="tòa" name="building" record={b} onOpen={onOpen} onArchive={onArchive}/>}</div>)}{orphanFloors.map(f=><div className="spatial-room" key={f.id}><span>Tầng {f.code||f.name||'chưa đặt tên'}</span>{can('building.write')&&<Op title="tầng" name="floor" record={f} onOpen={onOpen} onArchive={onArchive}/>}</div>)}{orphanRooms.map(v=><div className="spatial-room" key={v.id}><span>Phòng {v.code||v.name||'chưa đặt tên'}</span>{can('building.write')&&<Op title="phòng" name="room" record={v} onOpen={onOpen} onArchive={onArchive}/>}</div>)}</section>}
 </div>;
}
