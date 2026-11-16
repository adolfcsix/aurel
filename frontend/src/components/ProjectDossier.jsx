import React from 'react';
import {Btn,Status} from './Ui.jsx';
import {projectEssentials} from '../lib/dossier-essentials.js';
import {findDossierRow} from '../lib/dossier-id.js';
import DossierFrame,{DossierBlock,DossierDetail,DossierEmpty,DossierRecord,DossierStat} from './DossierFrame.jsx';

export default function ProjectDossier({project,data,onClose,onBack,onEdit,onOpenUnit,can}){
 const view=projectEssentials(data,project);if(!view)return null;
 const {buildings,units,perBuilding,legacyBuildingCodes,withoutBuilding,unresolved,linkedFloors,linkedRooms,activeLeaseCount}=view;
 const canOpen=can('unit.read')||can('unit.write');
 return <DossierFrame signature="HỒ SƠ DỰ ÁN" title={project.name||'Dự án chưa đặt tên'} overline="Danh mục / Dự án"
  subtitle={[project.city,project.address].filter(Boolean).join(' · ')||'Địa điểm chưa cập nhật'}
  onClose={onClose} onBack={onBack} sections={[{key:'location',label:'Thông tin'},{key:'buildings',label:'Cơ cấu'},{key:'units',label:'Danh mục căn'}]}
  actions={can('project.write')&&<Btn kind="primary" icon="edit" onClick={()=>onEdit(project)}>Chỉnh sửa dự án</Btn>}>
  <div className="aurel-dossier-kpis" aria-label="Quy mô dự án">
   <DossierStat label="Tòa nhà" value={buildings.length} note="Liên kết dự án"/>
   <DossierStat label="Căn hộ" value={units.length} note="Danh mục hiện có"/>
   <DossierStat label="Hợp đồng đang hiệu lực" value={activeLeaseCount} note="Thuộc căn hộ dự án"/>
  </div>
  <DossierBlock sectionKey="location" eyebrow="01 / ĐỊNH DANH" title="Thông tin dự án">
   <div className="aurel-dossier-details">
    <DossierDetail label="Tên dự án">{project.name}</DossierDetail>
    {project.short&&<DossierDetail label="Mã viết tắt">{project.short}</DossierDetail>}
    <DossierDetail label="Khu vực / thành phố">{project.city}</DossierDetail>
    <DossierDetail label="Địa chỉ dự án">{project.address}</DossierDetail>
   </div>
  </DossierBlock>
  <DossierBlock sectionKey="buildings" eyebrow="02 / CƠ CẤU" title="Tòa nhà và vị trí">
   {buildings.length?<div className="aurel-dossier-records">{perBuilding.map(({building,units:related})=><DossierRecord key={building.id}
    eyebrow={building.code||'TÒA NHÀ'} title={building.name||building.code||'Tòa nhà chưa đặt tên'}
    meta={building.address||project.address||'Chưa cập nhật địa chỉ'} status={<span className="aurel-dossier-count">{related.length} căn liên kết</span>}/>)}</div>:<DossierEmpty>Chưa có tòa nhà liên kết bằng mã định danh.</DossierEmpty>}
   {legacyBuildingCodes.length>0&&<p className="aurel-dossier-fineprint">Tòa nhà trong danh mục tham chiếu: {legacyBuildingCodes.join(' · ')}. Chưa xác nhận liên kết với hồ sơ tòa nhà.</p>}
   {(linkedFloors.length>0||linkedRooms.length>0)&&<p className="aurel-dossier-fineprint">{linkedFloors.length} tầng · {linkedRooms.length} phòng đã liên kết trong danh mục.</p>}
   {(withoutBuilding.length>0||unresolved.length>0)&&<p className="aurel-dossier-fineprint">{withoutBuilding.length} căn chưa gán tòa bằng mã định danh{unresolved.length>0?` · ${unresolved.length} căn cần đối chiếu liên kết tòa nhà`:''}.</p>}
  </DossierBlock>
  <DossierBlock sectionKey="units" eyebrow="03 / TÀI SẢN" title="Căn hộ thuộc dự án">
   {units.length?<div className="aurel-dossier-records">{units.map(unit=>{
    const building=findDossierRow(buildings,unit.buildingId);
    return <DossierRecord key={unit.id} eyebrow={building?.name||unit.building||'CHƯA GÁN TÒA'}
     title={unit.code||'Căn hộ chưa có mã'} meta={[unit.floor&&`Tầng ${unit.floor}`,unit.room&&`Căn ${unit.room}`].filter(Boolean).join(' · ')||'Vị trí chưa cập nhật'}
     status={<Status value={unit.status}/>} action={canOpen&&<Btn kind="outline" intent="navigate" icon="arrowRight" onClick={()=>onOpenUnit(unit.id)}>Xem căn hộ</Btn>}/>
   })}</div>:<DossierEmpty>Chưa có căn hộ thuộc dự án.</DossierEmpty>}
  </DossierBlock>
 </DossierFrame>;
}
