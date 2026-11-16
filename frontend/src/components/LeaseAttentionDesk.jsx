import {findDossierRow} from '../lib/dossier-id.js';
import React,{useMemo,useState} from 'react';
import {Btn,Icon} from './Ui.jsx';
import {dmy} from '../lib/finance.js';
import {groupLeases,LEASE_STAGES,leaseDaysRemaining} from '../lib/workflow-desk.js';

/** A clear first stop for contracts needing action; the full ledger remains below. */
export default function LeaseAttentionDesk({leases=[],units=[],today,canEdit=false,onOpen,onRenew,onCloseLease,showNames=true}){
 const [filter,setFilter]=useState('');
 const groups=useMemo(()=>groupLeases(leases,today),[leases,today]);
 const prioritized=['draft','expired','expiring'].find(id=>groups[id].length>0)||'active';
 const current=filter||prioritized;
 const items=groups[current]||[];
 const currentMeta=LEASE_STAGES.find(x=>x.id===current);
 const code=lease=>findDossierRow(units,lease.unitId)?.code||'Căn hộ chưa gán mã';
 return <section className="aurel-lease-desk" aria-label="Theo dõi vòng đời hợp đồng">
  <div className="aurel-lease-desk-head"><div><span className="aurel-workbench-kicker">AUREL / THEO DÕI HỢP ĐỒNG</span><h3>Hồ sơ hợp đồng</h3><p>Theo dõi thời hạn, những hồ sơ cần bổ sung và các bước cần đối soát. Dữ liệu được cập nhật theo quyền truy cập của bạn.</p></div><span className="aurel-lease-total">{leases.length} hồ sơ</span></div>
  <div className="aurel-lease-filters" aria-label="Lọc theo trạng thái hợp đồng">{LEASE_STAGES.map(stage=><button key={stage.id} type="button" className={'aurel-lease-filter '+(current===stage.id?'is-active':'')} aria-pressed={current===stage.id} onClick={()=>setFilter(stage.id)}><span>{stage.label}</span><b>{groups[stage.id].length}</b></button>)}</div>
  <div className="aurel-lease-desk-body"><div className="aurel-lease-desk-section-title"><strong>{currentMeta.label}</strong><small>{currentMeta.note}</small></div>
   {!items.length?<div className="aurel-lease-empty"><Icon name="check" size={17}/> Không có hợp đồng ở trạng thái này.</div>:<div className="aurel-lease-items">{items.slice(0,4).map(lease=>{const days=leaseDaysRemaining(lease.endsOn,today);return <article className="aurel-lease-row" key={lease.id}><div className="aurel-lease-row-primary"><strong>{code(lease)}</strong><span>{showNames?(lease.tenantName||'Chưa ghi tên người thuê'):'Thông tin khách thuê được giới hạn'}</span></div><div className="aurel-lease-row-dates"><strong>{lease.endsOn?dmy(lease.endsOn):'Chưa có ngày kết thúc'}</strong><small>{days===null?'Chưa xác định thời hạn':days<0?'Quá hạn '+Math.abs(days)+' ngày':days===0?'Hết hạn hôm nay':'Còn '+days+' ngày'}</small></div><div className="aurel-lease-row-actions">{<Btn kind="outline" finish="pearl" onClick={()=>onOpen(lease)}>{canEdit&&lease.status==='draft'?'Hoàn thiện hồ sơ':'Xem hợp đồng'}</Btn>}{canEdit&&lease.status==='active'&&['expiring','expired'].includes(current)&&<Btn kind="outline" onClick={()=>onRenew(lease)}>Gia hạn</Btn>}{canEdit&&lease.status==='active'&&current==='expired'&&<Btn kind="outline" onClick={()=>onCloseLease(lease)}>Đối soát kết thúc</Btn>}</div></article>})}{items.length>4&&<p className="aurel-lease-overflow">Còn {items.length-4} hợp đồng trong nhóm. Danh sách đầy đủ ở bảng hợp đồng phía dưới.</p>}</div>}
  </div>
 </section>;
}
