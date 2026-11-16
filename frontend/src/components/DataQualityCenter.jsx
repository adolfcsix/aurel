import React,{useMemo,useState} from 'react';
import {Btn,Icon} from './Ui.jsx';

const labels={critical:'Cần xử lý',warning:'Cần rà soát'};
export default function DataQualityCenter({report,loading,error,onRefresh,onOpenSection}){
 const [filter,setFilter]=useState('all'),[query,setQuery]=useState('');
 const issues=useMemo(()=>(report?.issues||[]).filter(x=>(filter==='all'||x.severity===filter)&&(!query||[x.code,x.id,x.description,x.kind].join(' ').toLowerCase().includes(query.toLowerCase()))),[report,filter,query]);
 const hasResult=Boolean(report);
 const summary=report?.summary||{critical:0,warning:0,total:0,units:0,leases:0,schedules:0};
 return <div className="quality-workspace">
  <section className="quality-hero" aria-label="Trung tâm kiểm tra chất lượng dữ liệu">
   <div className="quality-hero-main"><span className="quality-superline"><span/> AUREL / ĐỐI SOÁT DỮ LIỆU</span><h2>Chất lượng dữ liệu<br/><em>là nền tảng vận hành.</em></h2><p>Đối chiếu danh mục, hợp đồng, lịch thu, giao dịch và tiền cọc. Không tự động sửa hoặc xóa dữ liệu tài chính.</p><div className="quality-meta"><span><b>{hasResult?summary.units:'—'}</b> căn hộ</span><span><b>{hasResult?summary.leases:'—'}</b> hợp đồng</span><span><b>{hasResult?summary.schedules:'—'}</b> kỳ thanh toán</span></div></div>
   <div className="quality-gauge"><span className="quality-gauge-label">KIỂM TRA HIỆN TẠI</span><strong>{hasResult?summary.critical:'—'}</strong><span>{hasResult?'vấn đề nghiêm trọng':'chưa có kết quả đối soát'}</span><div className="quality-severity-bars"><span className="quality-severity-danger" style={{width:`${summary.total?Math.max(0,summary.critical/summary.total*100):0}%`}}/><span className="quality-severity-warning" style={{width:`${summary.total?Math.max(0,summary.warning/summary.total*100):0}%`}}/></div><small>{hasResult?`${summary.warning} vấn đề cần rà soát · ${summary.total} phát hiện`:'Chỉ hiển thị số liệu sau khi máy chủ trả kết quả'}</small></div>
  </section>
  <section className="quality-review"><div className="quality-review-head"><div><div className="eyebrow">KIỂM TRA DỮ LIỆU / CHỈ XEM</div><h3>Danh sách vấn đề dữ liệu</h3><p>Chỉ báo phát hiện để quản lý xử lý trên màn hình nghiệp vụ tương ứng.</p></div><Btn icon="refresh" kind="outline" onClick={onRefresh} disabled={loading}>{loading?'Đang kiểm tra':'Kiểm tra lại'}</Btn></div>
   <div className="quality-controls"><div className="quality-filter" role="group" aria-label="Lọc mức độ">{[['all','Tất cả',summary.total],['critical','Nghiêm trọng',summary.critical],['warning','Cần rà soát',summary.warning]].map(([k,n,count])=><button key={k} type="button" className={filter===k?'selected':''} onClick={()=>setFilter(k)} aria-pressed={filter===k}>{n}<span>{count}</span></button>)}</div><label className="quality-search"><Icon name="search" size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm mã hồ sơ / vấn đề" aria-label="Tìm trong cảnh báo"/></label></div>
   {error&&<div className="quality-error" role="alert"><Icon name="alert"/> {error}</div>}
   {!error&&loading&&!report&&<div className="quality-empty">Đang kiểm tra các mối liên kết và dữ liệu tài chính…</div>}
   {!error&&!loading&&report?.truncated&&<div className="quality-error">Danh sách chỉ hiển thị 200 phát hiện đầu tiên. Hãy ưu tiên xử lý những vấn đề nghiêm trọng.</div>}
   {!error&&!loading&&!report&&<div className="quality-empty"><Icon name="shield" size={25}/><b>Chưa có kết quả đối soát.</b><span>Chọn Kiểm tra lại để lấy số liệu từ máy chủ.</span></div>}
   {!error&&!loading&&hasResult&&issues.length===0&&<div className="quality-empty"><Icon name="shield" size={25}/><b>Không có vấn đề trong bộ lọc này.</b><span>Đây là kiểm tra quy tắc dữ liệu, chưa thay thế việc đối soát với sao kê thực tế.</span></div>}
   {!error&&issues.length>0&&<div className="quality-list">{issues.map((issue,index)=><article className={'quality-item '+issue.severity} key={issue.key}><span className="quality-index">{String(index+1).padStart(2,'0')}</span><div className="quality-issue"><span className="quality-item-class">{labels[issue.severity]||'Thông tin'} / {issue.kind.toUpperCase()} / {issue.code}</span><h4>{issue.description}</h4><p>Hồ sơ: <code>{issue.id}</code></p></div><button className="quality-open" type="button" onClick={()=>onOpenSection(issue.section)} aria-label={'Mở phân hệ liên quan đến cảnh báo '+issue.code}>Xem phân hệ <Icon name="chevron" size={15}/></button></article>)}</div>}
  </section>
  <p className="quality-footnote"><Icon name="shield" size={16}/> Bộ kiểm tra không sửa dữ liệu tự động. Hồ sơ nháp được phép thiếu địa chỉ, tầng, số phòng và giá thuê; chỉ thông tin sai liên kết hoặc vi phạm nguyên tắc tài chính mới được cảnh báo.</p>
 </div>
}
