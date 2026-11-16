import React from 'react';
import {Icon, Status, Empty} from './Ui.jsx';
import {reviewUnit} from '../lib/portfolio-review.js';
import {contractDuration,feeLabel,recordFinancial,unitLocation} from '../lib/record-presentation.js';
import {findDossierRow} from '../lib/dossier-id.js';
import {unitPartyName} from '../lib/client-profile.js';

const Meta = ({label,children}) => <div className="aurel-record-meta"><span>{label}</span><strong>{children===null||children===undefined||children===''?'Chưa cập nhật':children}</strong></div>;
const CardHead = ({eyebrow,title,subtitle,children}) => <div className="aurel-record-head"><div className="aurel-record-heading"><span className="aurel-record-eyebrow">{eyebrow}</span><h4>{title}</h4>{subtitle && <p>{subtitle}</p>}</div><div className="aurel-record-head-aside">{children}</div></div>;
const Footer = ({children}) => <div className="aurel-record-footer">{children}</div>;

export function UnitMobileList({units=[],projects=[],buildings=[],staff=[],clients=[],selected=[],onSelect,onOpen,onEdit,canEdit=false,showFinancial=true,showStaff=true,money}){
 const projectName=id=>findDossierRow(projects,id)?.name || 'Chưa chọn dự án';
 const managerName=id=>findDossierRow(staff,id)?.name || 'Chưa phân công';
 const buildingName=id=>{const building=findDossierRow(buildings,id);return building?.code||building?.name||''};
 return <div className="aurel-mobile-records" aria-label="Danh sách căn hộ trên điện thoại">
  {units.map(u=>{const review=reviewUnit(u);return <article className="aurel-record-card aurel-unit-card" key={u.id}>
   <CardHead eyebrow={projectName(u.projectId)} title={u.code||'Căn chưa đặt mã'} subtitle={unitLocation(u,buildingName(u.buildingId))}><Status value={u.status}/></CardHead>
   {showFinancial&&<div className="aurel-record-price"><span>GIÁ THUÊ / THÁNG</span><strong>{recordFinancial(u,money)}</strong></div>}
   {(showFinancial||showStaff)&&<div className="aurel-record-meta-grid">{showFinancial&&<><Meta label="Chủ sở hữu">{unitPartyName({clients},u,'owner')||'Chưa cập nhật'}</Meta><Meta label="Phí quản lý">{feeLabel(u)}</Meta></>}{showStaff&&<Meta label="Người phụ trách">{managerName(u.managerId)}</Meta>}</div>}
   {canEdit&&!review.complete&&<div className="aurel-record-review"><Icon name="alert" size={16}/><span>Cần bổ sung {review.labels.length} mục: {review.labels.slice(0,2).join(', ')}{review.labels.length>2?'…':''}</span></div>}
   <Footer><button type="button" className="aurel-record-action" aria-label={'Xem hồ sơ căn '+(u.code||'chưa đặt mã')} onClick={()=>onOpen(u.id)}><span>Xem hồ sơ</span><span className="aurel-record-action-icon"><Icon name="chevron" size={17} stroke={1.9}/></span></button>{canEdit&&<label className="aurel-record-select"><input aria-label={'Chọn căn '+(u.code||u.id)} type="checkbox" checked={selected.includes(u.id)} onChange={()=>onSelect(u.id)}/><span>Chọn</span></label>}{canEdit&&<button type="button" className="aurel-record-quiet" onClick={()=>onEdit(u)}>Sửa <Icon name="edit" size={15}/></button>}</Footer>
  </article>})}
  {!units.length&&<Empty label="Không có căn hộ phù hợp" help="Danh mục hiện không có căn hộ theo bộ lọc."/>}
 </div>;
}

export function LeaseMobileList({leases=[],getUnit,money,date,onView,onEdit,onRenew,onClose,onArchive,canEdit=false,showFinancial=true}){
 return <div className="aurel-mobile-records" aria-label="Hợp đồng thuê trên điện thoại">
 {leases.map(l=><article className="aurel-record-card" key={l.id}>
  <CardHead eyebrow="HỢP ĐỒNG THUÊ" title={getUnit(l.unitId)?.code||'Chưa chọn căn'} subtitle={showFinancial?(l.tenantName||'Chưa có người thuê'):'Thông tin khách thuê được giới hạn'}><Status value={l.status}/></CardHead>
  {showFinancial&&<div className="aurel-record-price"><span>GIÁ THUÊ / KỲ</span><strong>{recordFinancial(l,money)}</strong></div>}
  <div className="aurel-record-meta-grid aurel-record-meta-wide"><Meta label="Thời hạn">{contractDuration(l,date)}</Meta></div>
  <Footer><button className="aurel-record-action" onClick={()=>onView?.(l)} type="button"><span>Xem hồ sơ hợp đồng</span><span className="aurel-record-action-icon"><Icon name="chevron" size={15}/></span></button>{canEdit&&<><button className="aurel-record-quiet" onClick={()=>onEdit(l)} type="button"><span>Sửa</span><Icon name="edit" size={15}/></button>{l.status==='active'&&<button type="button" className="aurel-record-quiet" onClick={()=>onRenew(l)}>Gia hạn</button>}{l.status==='active'&&<button type="button" className="aurel-record-quiet" onClick={()=>onClose(l)}>Kết thúc</button>}<button type="button" className="aurel-record-quiet" onClick={()=>onArchive(l)}>Lưu trữ</button></>}</Footer>
 </article>)}
 {!leases.length&&<Empty label="Chưa có hợp đồng thuê"/>}
 </div>;
}

export function ScheduleMobileList({rows=[],getUnit,money,date,onCollect,canCollect=false}){
 return <div className="aurel-mobile-records" aria-label="Lịch thu tiền trên điện thoại">
 {rows.map(s=><article className="aurel-record-card" key={s.id}>
  <CardHead eyebrow={'KỲ THU '+(s.period||'')} title={getUnit(s.unitId)?.code||'Căn chưa xác định'} subtitle={'Hạn thanh toán · '+date(s.dueOn)}><Status value={s.left>0?'open':'posted'}/></CardHead>
  <div className="aurel-record-price"><span>CÒN PHẢI THU</span><strong className={s.left>0?'aurel-record-due':''}>{money(s.left)}</strong></div>
  <div className="aurel-record-meta-grid"><Meta label="Phải thu">{money(s.amount)}</Meta><Meta label="Đã thu">{money(s.paid)}</Meta></div>
  {canCollect&&s.left>0&&<Footer><button className="aurel-record-action" type="button" onClick={()=>onCollect(s)}><span>Ghi nhận thanh toán</span><span className="aurel-record-action-icon"><Icon name="plus" size={16}/></span></button></Footer>}
 </article>)}
 {!rows.length&&<Empty label="Không có kỳ thu phù hợp" help="Chọn kỳ thanh toán khác để tiếp tục."/>}
 </div>;
}

export function DepositMobileList({rows=[],getUnit,money,onReceive,onSettle,canReceive=()=>true,canSettle=()=>true,canEdit=false}){
 return <div className="aurel-mobile-records" aria-label="Các hồ sơ tiền cọc trên điện thoại">
 {rows.map(l=><article className="aurel-record-card" key={l.id}>
  <CardHead eyebrow="SỐ DƯ TIỀN CỌC" title={getUnit(l.unitId)?.code||'Căn chưa xác định'} subtitle="Theo hợp đồng thuê"><Status value={l.status}/></CardHead>
  <div className="aurel-record-price"><span>ĐANG GIỮ HỘ</span><strong>{money(l.held)}</strong></div>
  <div className="aurel-record-meta-grid"><Meta label="Cọc thỏa thuận">{money(l.depositExpected)}</Meta><Meta label="Tình trạng">{l.status==='ended'?'Hợp đồng đã kết thúc':'Theo hợp đồng đang hiệu lực'}</Meta></div>
  {canEdit&&(canReceive(l)||canSettle(l))&&<Footer>{canReceive(l)&&<button type="button" className="aurel-record-action" onClick={()=>onReceive(l)}><span>Ghi nhận cọc</span><span className="aurel-record-action-icon"><Icon name="plus" size={16}/></span></button>}{canSettle(l)&&<button type="button" className="aurel-record-quiet" onClick={()=>onSettle(l)}>Lập đề nghị hoàn</button>}</Footer>}
 </article>)}
 {!rows.length&&<Empty label="Chưa có hồ sơ tiền cọc"/>}
 </div>;
}

export function PaymentLedgerMobileList({rows=[],getUnit,money,date,renderEvidence,onReverse,canWrite=false}){
 return <div className="aurel-mobile-records" aria-label="Giao dịch tiền thuê trên điện thoại">
 {rows.map(p=><article className="aurel-record-card" key={p.id}>
  <CardHead eyebrow="GIAO DỊCH TIỀN THUÊ" title={getUnit(p.unitId)?.code||'Căn chưa xác định'} subtitle={`${date(p.date)} · Kỳ ${p.period||'—'}`}><Status value={p.status}/></CardHead>
  <div className="aurel-record-price"><span>SỐ TIỀN GIAO DỊCH</span><strong>{money(p.amount)}</strong></div>
  <div className="aurel-record-meta-grid"><Meta label="Phương thức">{p.method||'Chưa cập nhật'}</Meta><Meta label="Mã chứng từ">{p.reference||'Chưa có'}</Meta></div>
  {canWrite&&<Footer>{renderEvidence?.(p)}{p.status==='posted'&&<button type="button" className="aurel-record-quiet" onClick={()=>onReverse(p)}>Đảo giao dịch</button>}</Footer>}
 </article>)}
 {!rows.length&&<Empty label="Chưa có giao dịch trong kỳ"/>}
 </div>;
}

export function DepositLedgerMobileList({rows=[],getUnit,money,date}){
 return <div className="aurel-mobile-records" aria-label="Nhật ký tiền cọc trên điện thoại">
 {rows.map((t,index)=><article className="aurel-record-card" key={t.id||`${t.leaseId}-${index}`}>
  <CardHead eyebrow={t.kind==='receive'?'NHẬN TIỀN CỌC':'QUYẾT TOÁN CỌC'} title={getUnit(t.unitId)?.code||'Căn chưa xác định'} subtitle={date(t.date)}/>
  <div className="aurel-record-price"><span>SỐ TIỀN GHI NHẬN</span><strong>{money(t.amount)}</strong></div>
  <div className="aurel-record-meta-grid"><Meta label="Hoàn khách">{money(t.refund)}</Meta><Meta label="Đối trừ">{money(t.deduction)}</Meta></div>
  {t.note&&<div className="aurel-record-note">{t.note}</div>}
 </article>)}
 {!rows.length&&<Empty label="Chưa có giao dịch cọc"/>}
 </div>;
}

export function ClientMobileList({clients=[],onView,onEdit,canEdit=false}){
 return <div className="aurel-mobile-records" aria-label="Hồ sơ chủ sở hữu và khách thuê trên điện thoại">
 {clients.map(c=><article key={c.id} className="aurel-record-card aurel-contact-card">
  <CardHead eyebrow={c.type==='owner'?'CHỦ SỞ HỮU':c.type==='tenant'?'KHÁCH THUÊ':'HỒ SƠ LIÊN HỆ'} title={c.name||'Khách hàng chưa đặt tên'} subtitle={c.code||'Chưa có mã hồ sơ'}/>
  <div className="aurel-record-meta-grid"><Meta label="Điện thoại">{c.phone}</Meta><Meta label="Thư điện tử">{c.email}</Meta></div>
  <Footer><button type="button" className="aurel-record-action" onClick={()=>onView?.(c)}><span>Xem hồ sơ liên hệ</span><span className="aurel-record-action-icon"><Icon name="chevron" size={17}/></span></button>{canEdit&&<button className="aurel-record-quiet" type="button" onClick={()=>onEdit?.(c)}><Icon name="edit" size={15}/> Sửa</button>}</Footer>
 </article>)}
 {!clients.length&&<Empty label="Không có hồ sơ liên hệ phù hợp" help="Không có hồ sơ liên hệ trong phạm vi tìm kiếm."/>}
 </div>;
}
