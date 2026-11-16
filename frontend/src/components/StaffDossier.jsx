import React from 'react';
import {Btn,Status} from './Ui.jsx';
import {staffEssentials} from '../lib/dossier-essentials.js';
import {clientContactLink} from '../lib/client-profile.js';
import {findDossierRow} from '../lib/dossier-id.js';
import DossierFrame,{DossierBlock,DossierDetail,DossierEmpty,DossierRecord,DossierStat} from './DossierFrame.jsx';

function Contact({kind,value}){const href=clientContactLink(kind,value);return href?<a className="aurel-client-contact-link" href={href}>{value}</a>:(value||'Chưa cập nhật');}

export default function StaffDossier({staff,data,onClose,onBack,onEdit,onOpenUnit,can,showContact=true}){
 const view=staffEssentials(data,staff);if(!view)return null;
 const {managed,sales,unique,projectCount,responsibility}=view;
 const project=id=>findDossierRow(data.projects,id)?.name||'Chưa gắn dự án';
 const building=id=>findDossierRow(data.buildings,id)?.name;
 const canOpen=can('unit.read')||can('unit.write');
 return <DossierFrame signature="HỒ SƠ NHÂN SỰ" title={staff.name||'Nhân viên chưa đặt tên'} overline="Nhân sự / Phân công" subtitle={staff.role||'Vị trí chưa cập nhật'} onClose={onClose} onBack={onBack}
  sections={[{key:'profile',label:'Thông tin'},{key:'responsibility',label:'Phân công'}]}
  actions={can('staff.write')&&<Btn kind="primary" icon="edit" onClick={()=>onEdit(staff)}>Chỉnh sửa nhân sự</Btn>}>
  <div className="aurel-dossier-kpis" aria-label="Phạm vi phân công">
   <DossierStat label="Căn hộ quản lý" value={managed.length} note="Gán theo mã nhân sự"/>
   <DossierStat label="Căn hộ kinh doanh" value={sales.length} note="Gán theo mã nhân sự"/>
   <DossierStat label="Dự án phụ trách" value={projectCount} note="Không tính trùng dự án"/>
  </div>
  <DossierBlock sectionKey="profile" eyebrow="01 / NHÂN SỰ" title="Thông tin công tác">
   <div className="aurel-dossier-details">
    <DossierDetail label="Họ và tên">{staff.name}</DossierDetail>
    <DossierDetail label="Mã viết tắt">{staff.short}</DossierDetail>
    <DossierDetail label="Vị trí công tác">{staff.role}</DossierDetail>
    {showContact&&<><DossierDetail label="Điện thoại"><Contact kind="phone" value={staff.phone}/></DossierDetail><DossierDetail label="Email"><Contact kind="email" value={staff.email}/></DossierDetail></>}
   </div>
   {showContact&&Boolean(staff.notes?.trim())&&<div className="aurel-client-notes"><span>Ghi chú nội bộ</span><p>{staff.notes}</p></div>}
  </DossierBlock>
  <DossierBlock sectionKey="responsibility" eyebrow="02 / DANH MỤC" title="Căn hộ được phân công">
   {unique.length?<div className="aurel-dossier-records">{unique.map(unit=><DossierRecord key={unit.id} eyebrow={responsibility(unit).join(' · ')}
    title={unit.code||'Căn hộ chưa có mã'}
    meta={[project(unit.projectId),building(unit.buildingId)||unit.building,unit.floor&&`Tầng ${unit.floor}`].filter(Boolean).join(' · ')}
    status={<Status value={unit.status}/>} action={canOpen&&<Btn kind="outline" intent="navigate" icon="arrowRight" onClick={()=>onOpenUnit(unit.id)}>Xem căn hộ</Btn>}/>)}</div>:<DossierEmpty>Chưa có căn hộ được phân công.</DossierEmpty>}
  </DossierBlock>
 </DossierFrame>;
}
