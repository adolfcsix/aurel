import React from 'react';
import {Btn,Status} from './Ui.jsx';
import DossierFrame,{DossierBlock,DossierDetail,DossierEmpty,DossierRecord,DossierStat} from './DossierFrame.jsx';
import {contactDisplayType} from '../lib/dossier-relations.js';
import {clientProfileView,clientContactLink,unitRelationLabel} from '../lib/client-profile.js';
import {dmy} from '../lib/finance.js';
import {findDossierRow} from '../lib/dossier-id.js';

function ContactValue({kind,value}){
 const href=clientContactLink(kind,value);
 return href?<a className="aurel-client-contact-link" href={href}>{value}</a>:(value||'Chưa cập nhật');
}

export default function ClientDossier({client,data,onClose,onBack,onEdit,onOpenUnit,onOpenLease,can}){
 const {linked,verified,possible,projectCount,hasContact,hasNotes,sections}=clientProfileView(data,client);
 const project=id=>findDossierRow(data.projects,id);
 const building=id=>findDossierRow(data.buildings,id);
 const canOpenUnit=can('unit.read')||can('unit.write');
 const canOpenLease=can('lease.read')||can('lease.write');
 return <DossierFrame signature="HỒ SƠ KHÁCH HÀNG"
  title={client.name||'Hồ sơ chưa có tên'}
  overline="Hồ sơ khách hàng / Quan hệ tài sản"
  subtitle={[contactDisplayType(client.type),client.code&&`Mã hồ sơ ${client.code}`].filter(Boolean).join(' · ')}
  extraClass="aurel-client-dossier"
  onClose={onClose} onBack={onBack} sections={sections}
  actions={can('client.write')&&<Btn icon="edit" kind="primary" onClick={()=>onEdit(client)}>Chỉnh sửa hồ sơ</Btn>}
 >
  <div className="aurel-dossier-kpis aurel-client-summary" aria-label="Tổng quan hồ sơ">
   <DossierStat label="Căn hộ sở hữu" value={linked.owned.length} note="Liên kết trực tiếp theo hồ sơ"/>
   <DossierStat label="Căn hộ đang thuê" value={linked.rented.length} note="Liên kết trực tiếp theo hồ sơ"/>
   <DossierStat label="Dự án liên quan" value={projectCount} note="Trong danh mục được cấp quyền"/>
  </div>
  <DossierBlock sectionKey="contact" eyebrow="01 / THÔNG TIN" title="Thông tin cơ bản">
   <div className="aurel-dossier-details aurel-client-identity">
    <DossierDetail label="Họ và tên">{client.name}</DossierDetail>
    <DossierDetail label="Mã hồ sơ">{client.code}</DossierDetail>
    <DossierDetail label="Vai trò">{contactDisplayType(client.type)}</DossierDetail>
    <DossierDetail label="Điện thoại"><ContactValue kind="phone" value={client.phone}/></DossierDetail>
    <DossierDetail label="Email"><ContactValue kind="email" value={client.email}/></DossierDetail>
    <DossierDetail label="Địa chỉ liên hệ">{client.address}</DossierDetail>
   </div>
   {!hasContact&&<p className="aurel-client-status-note">Chưa có số điện thoại hoặc email trong hồ sơ.</p>}
   {hasNotes&&<div className="aurel-client-notes"><span>Ghi chú nội bộ</span><p>{client.notes}</p></div>}
  </DossierBlock>
  <DossierBlock sectionKey="properties" eyebrow="02 / TÀI SẢN" title="Tài sản liên quan">
   {linked.all.length?<div className="aurel-dossier-records">{linked.all.map(unit=>{
    const p=project(unit.projectId),b=building(unit.buildingId);
    const location=[p?.name,b?.name||unit.building,unit.floor&&`Tầng ${unit.floor}`,unit.room&&`Căn ${unit.room}`].filter(Boolean).join(' · ');
    return <DossierRecord key={unit.id} eyebrow={unitRelationLabel(unit,linked)} title={unit.code||'Căn hộ chưa có mã'}
     meta={location||'Chưa cập nhật vị trí'} status={<Status value={unit.status}/>}
     action={canOpenUnit&&<Btn kind="outline" intent="navigate" icon="arrowRight" onClick={()=>onOpenUnit(unit.id)}>Xem căn hộ</Btn>}/>;
   })}</div>:<DossierEmpty>Chưa có căn hộ liên kết với hồ sơ này.</DossierEmpty>}
  </DossierBlock>
  <DossierBlock sectionKey="matching" eyebrow="03 / HỢP ĐỒNG" title="Hợp đồng và quan hệ liên quan">
   {verified.length>0&&<div className="aurel-dossier-records" aria-label="Hợp đồng có mã hồ sơ khách thuê">{verified.map(lease=>{
    const unit=findDossierRow(data.units,lease.unitId);
    return <DossierRecord key={lease.id} eyebrow="Đã liên kết theo mã hồ sơ" title={unit?.code||'Căn hộ chưa xác định'}
     meta={`${dmy(lease.startsOn)} – ${dmy(lease.endsOn)}`}
     action={canOpenLease&&<Btn kind="outline" intent="navigate" icon="arrowRight" onClick={()=>onOpenLease(lease.id)}>Xem hợp đồng</Btn>}/>;
   })}</div>}
   {possible.length>0&&<>
    <p className="aurel-client-match-note">Hợp đồng tại căn hộ có liên quan nhưng chưa xác nhận người thuê bằng mã hồ sơ này.</p>
    <div className="aurel-dossier-records">{possible.map(lease=>{
     const unit=findDossierRow(data.units,lease.unitId);
     return <DossierRecord key={lease.id} eyebrow="Hợp đồng tại căn liên quan" title={unit?.code||'Căn hộ chưa xác định'}
      meta={`${dmy(lease.startsOn)} – ${dmy(lease.endsOn)}${canOpenLease&&lease.tenantName?` · ${lease.tenantName}`:''}`}
      action={canOpenLease&&<Btn kind="outline" intent="navigate" icon="arrowRight" onClick={()=>onOpenLease(lease.id)}>Xem hợp đồng</Btn>}/>;
    })}</div>
   </>}{!verified.length&&!possible.length&&<DossierEmpty>Chưa có hợp đồng liên quan.</DossierEmpty>}
  </DossierBlock>
 </DossierFrame>;
}
