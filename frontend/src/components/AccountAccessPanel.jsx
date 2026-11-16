import React,{useMemo,useState} from 'react';
import {Icon} from './Ui.jsx';
import {accountDisplayName,accountInitial,accountIsCurrent,accountMayReset,accountState,accountStateLabels,accountSummary,accountVisibleRows} from '../lib/account-presentation.js';

function OwnerLinkControls({user,clients,onVerify,onRevoke}){
 const [clientId,setClientId]=useState('');
 const [busy,setBusy]=useState(false);
 const linked=(user.verifiedOwnerClientIds||[]).map(id=>clients.find(client=>String(client.id)===String(id))).filter(Boolean);
 const options=clients.filter(client=>['owner','both'].includes(client.type)&&client.status!=='archived'&&!(user.verifiedOwnerClientIds||[]).some(id=>String(id)===String(client.id)));
 const action=async(fn,id)=>{if(busy)return;setBusy(true);try{if(await fn(user,id))setClientId('')}finally{setBusy(false)}};
 return <details className="aurel-owner-admin-links" aria-label={'Xác minh sở hữu cho '+user.name}>
  <summary>Liên kết chủ sở hữu đã xác minh · {linked.length} hồ sơ</summary>
  <small>Quyền theo hồ sơ chủ sở hữu (đã kiểm tra giấy tờ ngoài hệ thống)</small>
  {linked.map(client=><span className="aurel-owner-link-chip" key={client.id}><Icon name="check" size={13}/>{client.name||client.code||client.id}<button type="button" disabled={busy} onClick={()=>action(onRevoke,client.id)} aria-label={'Thu hồi liên kết '+(client.name||client.id)}>Thu hồi</button></span>)}
  <div className="aurel-owner-link-actions"><select aria-label={'Chọn hồ sơ chủ sở hữu cho '+user.name} value={clientId} onChange={e=>setClientId(e.target.value)} disabled={busy}><option value="">Chọn hồ sơ đã xác minh…</option>{options.map(client=><option key={client.id} value={client.id}>{client.code?client.code+' · ':''}{client.name||client.id}</option>)}</select><button type="button" disabled={busy||!clientId} onClick={()=>action(onVerify,clientId)}>Xác minh & liên kết</button></div>
 </details>;
}

export default function AccountAccessPanel({users=[],clients=[],roleNames={},currentUserId,onEdit,onReset,onVerifyOwner,onRevokeOwner}){
 const [search,setSearch]=useState('');
 const [filter,setFilter]=useState('all');
 const visible=useMemo(()=>accountVisibleRows(users,{filter,search,roleNames}),[users,search,filter,roleNames]);
 const summary=useMemo(()=>accountSummary(users),[users]);
 const hasFilter=!!search.trim()||filter!=='all';
 return <div className="aurel-access-manager">
  <div className="aurel-access-summary">
   <div><span>TÀI KHOẢN TRUY CẬP</span><strong>{String(summary.total).padStart(2,'0')}</strong><small>Danh mục tài khoản nội bộ</small></div>
   <div><span>ĐANG HOẠT ĐỘNG</span><strong>{String(summary.total-summary.locked).padStart(2,'0')}</strong><small>Đã đăng ký, có quyền Người xem trở lên</small></div>
   <div><span>ĐÃ KHÓA</span><strong>{String(summary.locked).padStart(2,'0')}</strong><small>Không được phép đăng nhập</small></div>
  </div>
  <div className="aurel-access-toolbar">
   <div className="aurel-access-find"><Icon name="search" size={17}/><input aria-label="Tìm kiếm tài khoản" placeholder="Tìm theo tên, tài khoản hoặc vai trò" value={search} onChange={e=>setSearch(e.target.value)}/></div>
   <select aria-label="Lọc trạng thái tài khoản" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Tất cả trạng thái</option><option value="active">Đang hoạt động</option><option value="pending_activation">Chờ kích hoạt cũ</option><option value="disabled">Đã khóa</option></select>
   <span className="aurel-access-footnote">Người dùng tự đăng ký và vào ngay với quyền Người xem. Quản trị viên cấp thêm quyền nghiệp vụ khi phù hợp.</span>
  </div>
  <div className="aurel-access-list" role="list" aria-label="Danh sách tài khoản">
   {visible.map(u=>{const status=accountState(u),name=accountDisplayName(u),self=accountIsCurrent(u,currentUserId);return <article role="listitem" className="aurel-access-user" key={u.id}>
    <div className="aurel-access-avatar" aria-hidden="true">{accountInitial(u)}</div>
    <div className="aurel-access-identity"><strong>{name}</strong><span>@{u.username} <i aria-hidden="true">·</i> {roleNames[u.role]||u.role}{self?' · Bạn':''}</span></div>
    <span className={'aurel-access-status '+status}><i/>{accountStateLabels[status]}</span>
    <div className="aurel-access-actions">
     <button type="button" onClick={()=>onEdit(u)} aria-label={'Chỉnh quyền tài khoản '+name}><Icon name="edit" size={16}/> Chỉnh quyền</button>
     {accountMayReset(u,currentUserId)&&<button type="button" onClick={()=>onReset(u)} aria-label={'Đặt lại mật khẩu tài khoản '+name} title="Cấp mật khẩu tạm mới và thu hồi phiên cũ"><Icon name="shield" size={16}/> Đặt lại mật khẩu</button>}
    </div>
    {onVerifyOwner&&onRevokeOwner&&<OwnerLinkControls user={u} clients={clients} onVerify={onVerifyOwner} onRevoke={onRevokeOwner}/>}
   </article>})}
   {!visible.length&&<div className="aurel-access-empty" role="status">{hasFilter?'Không có tài khoản phù hợp.':'Chưa có tài khoản đăng ký.'}</div>}
  </div>
  <p className="aurel-access-footnote"><Icon name="shield" size={15}/> Thay đổi quyền truy cập và mật khẩu được ghi nhật ký.</p>
 </div>;
}
