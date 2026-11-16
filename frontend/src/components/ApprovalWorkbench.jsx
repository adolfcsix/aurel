import React,{useId,useMemo,useState} from 'react';
import {Btn,Icon} from './Ui.jsx';
import {money,dmy} from '../lib/finance.js';
import {groupDepositProposals,PROPOSAL_STAGES,proposalActions,proposalStatusText} from '../lib/workflow-desk.js';
import {filterProposalDesk,firstPage} from '../lib/atelier-precision.js';
import {findDossierRow} from '../lib/dossier-id.js';

/** The server is the final authority for approve/reject/disbursement. */
export default function ApprovalWorkbench({proposals=[],units=[],users=[],user,can,onApprove,onReject,onExecute,busy=false}){
 const [stage,setStage]=useState('pending');
 const [query,setQuery]=useState('');
 const [visibleCount,setVisibleCount]=useState(6);
 const tabsId=useId();
 const groups=useMemo(()=>groupDepositProposals(proposals),[proposals]);
 const unitName=id=>findDossierRow(units,id)?.code||'Căn hộ chưa gán mã';
 const actorName=item=>item.createdByName||findDossierRow(users,item.createdBy)?.name||'Không rõ';
 const rows=useMemo(()=>filterProposalDesk(groups[stage]||[],units,users,query),[groups,stage,query,units,users]);
 const shown=firstPage(rows,visibleCount);
 const meta=PROPOSAL_STAGES.find(item=>item.id===stage);
 const handleKey=(event,index)=>{
  if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
  event.preventDefault();
  const next=event.key==='Home'?0:event.key==='End'?PROPOSAL_STAGES.length-1:(index+(event.key==='ArrowRight'?1:-1)+PROPOSAL_STAGES.length)%PROPOSAL_STAGES.length;
  setStage(PROPOSAL_STAGES[next].id);setVisibleCount(6);
  document.getElementById(tabsId+'-'+next)?.focus();
 };
 return <section className="aurel-workbench" aria-label="Bàn phê duyệt và quyết toán cọc">
  <div className="aurel-workbench-header"><div><span className="aurel-workbench-kicker">AUREL / KIỂM SOÁT TÀI CHÍNH</span><h3>Bàn phê duyệt & quyết toán</h3><p>Mỗi bước được xử lý riêng. Một đề nghị được duyệt chưa đồng nghĩa tiền đã được chi.</p></div><span className="aurel-workbench-seal"><Icon name="shield" size={17}/> Kiểm soát theo vai trò</span></div>
  <div className="aurel-workbench-tabs" role="tablist" aria-label="Các giai đoạn xử lý">
   {PROPOSAL_STAGES.map((item,index)=><button id={tabsId+'-'+index} key={item.id} role="tab" type="button" tabIndex={stage===item.id?0:-1} aria-controls={tabsId+'-panel'} aria-selected={stage===item.id} className={'aurel-workbench-tab '+(stage===item.id?'is-active':'')} onClick={()=>{setStage(item.id);setVisibleCount(6)}} onKeyDown={e=>handleKey(e,index)}><span>{item.label}</span><strong>{groups[item.id].length}</strong></button>)}
  </div>
  <div role="tabpanel" id={tabsId+'-panel'} aria-labelledby={tabsId+'-'+PROPOSAL_STAGES.findIndex(x=>x.id===stage)} className="aurel-workbench-body" tabIndex={0}>
   <p className="aurel-workbench-stage-note"><Icon name="shield" size={15}/>{meta.note}</p>
   <div className="aurel-workbench-tools"><label htmlFor={tabsId+'-search'}><Icon name="search" size={17}/><span className="sr-only">Lọc hồ sơ đề nghị hoàn cọc</span><input id={tabsId+'-search'} type="search" placeholder="Tìm theo căn hộ, người lập hoặc trạng thái" value={query} onChange={e=>{setQuery(e.target.value);setVisibleCount(6)}}/></label><span className="aurel-workbench-result" role="status">{rows.length} hồ sơ phù hợp</span></div>
   {rows.length===0?<div className="aurel-workbench-empty"><span className="aurel-workbench-empty-icon"><Icon name="check" size={22}/></span><strong>{query?'Không tìm thấy hồ sơ phù hợp':'Chưa có hồ sơ ở giai đoạn này'}</strong><p>{query?'Không có hồ sơ tương ứng với bộ lọc hiện tại.':'Danh sách sẽ tự cập nhật khi có đề nghị ở trạng thái này.'}</p></div>:<div className="aurel-workbench-list">{shown.map(item=>{const actions=proposalActions(item,user,can);return <article className="aurel-workbench-item" key={item.id} aria-label={'Đề nghị của '+unitName(item.unitId)}><div className="aurel-workbench-item-top"><div><span className="aurel-workbench-item-overline">{proposalStatusText(item.status)}</span><h4>{unitName(item.unitId)}</h4><p>Người lập: {actorName(item)}</p></div><span className={'aurel-workbench-status stage-'+stage}>{stage==='approved'?'Đang chờ chi':stage==='pending'?'Cần quyết định':proposalStatusText(item.status)}</span></div><dl className="aurel-workbench-figures"><div><dt>Đề nghị hoàn khách</dt><dd>{money(item.refund)}</dd></div><div><dt>Khoản đối trừ</dt><dd>{money(item.deduction)}</dd></div><div><dt>Tổng quyết toán</dt><dd>{money((Number(item.refund)||0)+(Number(item.deduction)||0))}</dd></div></dl>{item.createdAt&&<p className="aurel-workbench-date">Lập ngày {dmy(String(item.createdAt).slice(0,10))}</p>}{(actions.approve||actions.reject||actions.execute)&&<div className="aurel-workbench-actions">{actions.reject&&<Btn disabled={busy} kind="dangerGhost" onClick={()=>onReject(item)}>Từ chối</Btn>}{actions.approve&&<Btn disabled={busy} kind="primary" onClick={()=>onApprove(item)}>Phê duyệt</Btn>}{actions.execute&&<Btn disabled={busy} kind="primary" onClick={()=>onExecute(item)}>Xác nhận đã chi</Btn>}</div>}{!actions.approve&&!actions.reject&&!actions.execute&&stage!=='history'&&<p className="aurel-workbench-restricted"><Icon name="shield" size={14}/> Hồ sơ được xử lý bởi người có quyền độc lập với người lập / người duyệt.</p>}</article>})}</div>}{rows.length>visibleCount&&<div className="aurel-workbench-more"><Btn kind="outline" finish="pearl" onClick={()=>setVisibleCount(n=>n+6)}>Xem thêm {Math.min(6,rows.length-visibleCount)} hồ sơ</Btn><span>Đang hiển thị {visibleCount}/{rows.length} hồ sơ phù hợp</span></div>}
  </div>
  <div className="aurel-workbench-footer"><Icon name="shield" size={15}/><span>Lịch sử giao dịch và chứng từ được lưu riêng. Quyền và số dư được máy chủ kiểm tra lại trước khi ghi.</span></div>
 </section>;
}
