import React from 'react';
import {Btn,Status} from './Ui.jsx';
import {money,dmy,bill,balance} from '../lib/finance.js';
import {leaseEssentials,dossierAccess} from '../lib/dossier-essentials.js';
import DossierFrame,{DossierBlock,DossierDetail,DossierEmpty,DossierStat} from './DossierFrame.jsx';

const settlementStatus={pending:'Chờ phê duyệt',approved:'Đã duyệt, chờ chi',executed:'Đã xác nhận chi',rejected:'Đã từ chối'};

export default function LeaseDossier({lease,data,onClose,onBack,onEdit,onRenew,onCloseLease,onOpenUnit,onOpenClient,can,showFinancial=true}){
 const view=leaseEssentials(data,lease);if(!view)return null;
 const {unit,location,schedules,proposals,hasNotes,tenantProfile}=view;
 const access=dossierAccess(showFinancial);
 const items=access.financial?schedules.map(schedule=>({schedule,summary:bill(data,schedule)})):[];
 const due=items.reduce((sum,item)=>sum+(Number(item.summary.left)||0),0);
 return <DossierFrame signature="HỒ SƠ HỢP ĐỒNG" title={'Hợp đồng · '+(unit?.code||'Căn hộ chưa xác định')} overline="Hợp đồng / Hồ sơ thuê"
  subtitle={[showFinancial?lease.tenantName:null,location].filter(Boolean).join(' · ')||'Thông tin hợp đồng'}
  onClose={onClose} onBack={onBack}
  sections={showFinancial?[{key:'terms',label:'Điều khoản'},{key:'schedules',label:'Kỳ thu'},{key:'deposits',label:'Tiền cọc'}]:[{key:'terms',label:'Điều khoản'}]}
  actions={<>{unit&&<Btn kind="outline" intent="navigate" icon="arrowRight" onClick={()=>onOpenUnit(unit.id)}>Xem căn hộ</Btn>}
   {can('lease.write')&&<Btn kind="primary" icon="edit" onClick={()=>onEdit(lease)}>Chỉnh sửa</Btn>}
   {can('lease.write')&&lease.status==='active'&&<Btn icon="refresh" onClick={()=>onRenew(lease)}>Gia hạn</Btn>}
   {can('lease.write')&&lease.status==='active'&&<Btn kind="dangerGhost" onClick={()=>onCloseLease(lease)}>Kết thúc hợp đồng</Btn>}</>}>
  <div className="aurel-dossier-kpis" aria-label="Tổng quan hợp đồng">
   <DossierStat label="Trạng thái" value={<Status value={lease.status}/>} note="Trạng thái đã ghi nhận" valueClassName="aurel-dossier-kpi-status"/>
   <DossierStat label="Thời hạn đến" value={dmy(lease.endsOn)} note="Ngày hết hạn hợp đồng" valueClassName="aurel-dossier-kpi-date"/>
   {showFinancial&&<DossierStat label="Còn thu theo kỳ mở" value={money(due)} note={`${items.length} kỳ đang theo dõi`} valueClassName="aurel-dossier-kpi-money"/>}
  </div>
  <DossierBlock sectionKey="terms" eyebrow="01 / HỢP ĐỒNG" title="Điều khoản cơ bản">
   <div className="aurel-dossier-details">
    <DossierDetail label="Căn hộ">{unit?.code}</DossierDetail>
    <DossierDetail label="Vị trí">{location}</DossierDetail>
    {showFinancial&&<DossierDetail label="Người thuê ghi trên hợp đồng">{lease.tenantName}</DossierDetail>}
    {showFinancial&&tenantProfile&&(can('client.read')||can('client.write'))&&<DossierDetail label="Hồ sơ khách thuê liên kết">{tenantProfile.name||tenantProfile.code||'Hồ sơ khách thuê'}{(can('client.read')||can('client.write'))&&onOpenClient&&<Btn kind="outline" intent="navigate" icon="arrowRight" onClick={()=>onOpenClient(tenantProfile.id)}>Mở hồ sơ</Btn>}</DossierDetail>}
    <DossierDetail label="Ngày bắt đầu">{lease.startsOn?dmy(lease.startsOn):null}</DossierDetail>
    <DossierDetail label="Ngày kết thúc">{lease.endsOn?dmy(lease.endsOn):null}</DossierDetail>
    {showFinancial&&<>
     <DossierDetail label="Giá thuê mỗi kỳ">{lease.rent!=null?money(lease.rent):null}</DossierDetail>
     <DossierDetail label="Tiền cọc thỏa thuận">{lease.depositExpected!=null?money(lease.depositExpected):null}</DossierDetail>
     <DossierDetail label="Ngày thu định kỳ">{lease.paymentDay?`Ngày ${lease.paymentDay} hằng tháng`:null}</DossierDetail>
    </>}
   </div>
   {showFinancial&&hasNotes&&<div className="aurel-client-notes"><span>Điều khoản / ghi chú</span><p>{lease.notes}</p></div>}
   {showFinancial&&!view.tenantIdentityVerified&&<p className="aurel-dossier-identity-note">Chưa liên kết hồ sơ khách thuê bằng mã định danh. Tên ghi trên hợp đồng được giữ nguyên để đối chiếu.</p>}
  </DossierBlock>
  {showFinancial&&<>
   <DossierBlock sectionKey="schedules" eyebrow="02 / LỊCH THU" title="Các kỳ thu đang theo dõi">
    {items.length?<div className="aurel-dossier-records">{items.map(({schedule,summary})=><article key={schedule.id} className="aurel-dossier-record">
     <div><span className="aurel-dossier-record-kicker">KỲ {schedule.period||'CHƯA XÁC ĐỊNH'}</span><strong>Hạn {dmy(schedule.dueOn)}</strong><p>Phải thu {money(schedule.amount)} · Đã thu {money(summary.paid)}</p></div>
     <div className="aurel-dossier-record-amount"><span>Còn thu</span><strong>{money(summary.left)}</strong></div>
    </article>)}</div>:<DossierEmpty>Chưa có kỳ thu đang mở.</DossierEmpty>}
   </DossierBlock>
   <DossierBlock sectionKey="deposits" eyebrow="03 / TIỀN CỌC" title="Đặt cọc và quyết toán">
    <div className="aurel-dossier-details"><DossierDetail label="Số dư đang giữ">{money(balance(data,lease.id))}</DossierDetail><DossierDetail label="Đề nghị quyết toán">{proposals.length} hồ sơ</DossierDetail></div>
    {proposals.length>0&&<div className="aurel-dossier-records">{proposals.map(proposal=><article className="aurel-dossier-record" key={proposal.id}>
     <div><span className="aurel-dossier-record-kicker">ĐỀ NGHỊ QUYẾT TOÁN</span><strong>Hoàn {money(proposal.refund)}</strong><p>Đối trừ {money(proposal.deduction)}</p></div>
     <span className="aurel-dossier-status-text">{settlementStatus[proposal.status]||'Chưa rõ trạng thái'}</span>
    </article>)}</div>}
   </DossierBlock>
  </>}
 </DossierFrame>;
}
