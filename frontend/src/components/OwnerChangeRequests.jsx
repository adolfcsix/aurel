import React,{useEffect,useRef,useState} from 'react';
import ConfirmDialog from './ConfirmDialog.jsx';
import {api} from '../lib/http.js';
import {Btn} from './Ui.jsx';
import {createSessionBoundary} from '../lib/session-boundary.js';
import {ownerProposalDraftValue,reviewOwnerProposalDraft} from '../lib/owner-proposal-ux.js';
import {protectPendingWork} from '../lib/unload-guard.js';

// One small, scoped workflow: owner proposal and management review share labels.
export const OWNER_FIELD_LABELS={
 address:'Địa chỉ căn hộ',area:'Diện tích (m²)',bedrooms:'Số phòng ngủ',
 interiorStatus:'Tình trạng nội thất'
};
const interiorLabels={unfurnished:'Không nội thất',partial:'Một phần',furnished:'Đầy đủ'};
const showValue=(field,value)=>field==='interiorStatus'?(interiorLabels[value]||'Chưa xác định'):(value==null||value===''?'Chưa cập nhật':String(value));

export function OwnerChangeForm({unit,requests=[],onSaved,notify,canSubmit=true}){
 const [field,setField]=useState('address');
 const [value,setValue]=useState(()=>unit.address??'');
 const [reason,setReason]=useState('');
 const [busy,setBusy]=useState(false),[submitted,setSubmitted]=useState(false),[notice,setNotice]=useState('');
 const valueTouched=useRef(false),busyRef=useRef(false),mounted=useRef(true);
 const pending=requests.some(request=>String(request.unitId)===String(unit.id)&&request.status==='pending');
 const reviewed=reviewOwnerProposalDraft(unit,field,value,reason);
 const draftPending=!submitted&&(!!reason.trim()||String(value??'').trim()!==String(unit[field]??'').trim());
 useEffect(()=>protectPendingWork(window,busy||draftPending),[busy,draftPending]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
 // A background refresh must not erase the owner's unfinished proposal.
 useEffect(()=>{setValue(current=>ownerProposalDraftValue(unit[field],current,valueTouched.current))},[unit.id,field,unit.address,unit.area,unit.bedrooms,unit.interiorStatus]);
 const changeField=next=>{valueTouched.current=false;setField(next);setValue(unit[next]??'');setNotice('')};
 const submit=async(event)=>{
  event.preventDefault();if(!canSubmit||busyRef.current||pending||submitted||!reviewed.valid)return;
  busyRef.current=true;setBusy(true);setNotice('');let accepted=false;
  try{
   await api('/me/owned-units/'+encodeURIComponent(unit.id)+'/change-requests',{
    method:'POST',body:{field,value:reviewed.value,reason:reviewed.reason}
   });
   accepted=true;setSubmitted(true);valueTouched.current=false;
   const refreshed=await onSaved();
   if(!mounted.current)return;
   setReason('');
   if(refreshed===false){
    setNotice('Máy chủ đã nhận đề nghị nhưng danh sách chưa đồng bộ. Hãy tải lại để đối chiếu, không gửi lặp.');
   }else notify('Đã gửi đề nghị. Hồ sơ chỉ thay đổi sau khi quản lý duyệt.');
  }catch(error){
   if(!mounted.current)return;
   if(accepted||error.uncertain){
    setSubmitted(true);
    setNotice(accepted?'Đề nghị đã được tiếp nhận nhưng danh sách chưa đồng bộ. Hãy kiểm tra lại, không gửi lặp.':'Chưa xác định máy chủ đã nhận đề nghị hay chưa. Hãy làm mới và đối chiếu trước khi gửi lại.');
   }else setNotice(error.message);
  }finally{busyRef.current=false;if(mounted.current)setBusy(false)}
 };
 return <details className="aurel-owner-correction" aria-label={'Đề nghị chỉnh sửa căn '+(unit.code||unit.id)}>
  <summary>Đề nghị cập nhật thông tin căn hộ</summary>
  <p>Chỉ đề nghị sửa thông tin mô tả. Giá thuê, tiền cọc, phí và chứng từ do bộ phận quản lý xử lý riêng.</p>
  {pending||submitted?<p role="status">{notice||'Đã có đề nghị đang chờ duyệt cho căn hộ này.'}</p>:<form onSubmit={submit}>
   <label>Thông tin cần cập nhật<select className="field-input" value={field} disabled={busy} onChange={e=>changeField(e.target.value)}>{Object.entries(OWNER_FIELD_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <p className="aurel-proposal-current">Đang lưu trong hồ sơ: <strong>{showValue(field,unit[field])}</strong></p>
   <label>Giá trị đề nghị
    {field==='interiorStatus'?<select className="field-input" value={value} disabled={busy} onChange={e=>{valueTouched.current=true;setValue(e.target.value)}}><option value="">Chưa rõ</option><option value="unfurnished">Không nội thất</option><option value="partial">Một phần</option><option value="furnished">Đầy đủ</option></select>:<input className="field-input" type={field==='area'||field==='bedrooms'?'number':'text'} inputMode={field==='area'?'decimal':field==='bedrooms'?'numeric':'text'} disabled={busy} min={field==='area'||field==='bedrooms'?0:undefined} max={field==='area'||field==='bedrooms'?10000:undefined} step={field==='area'?'any':field==='bedrooms'?1:undefined} maxLength={300} value={value} onChange={e=>{valueTouched.current=true;setValue(e.target.value)}}/>}
   </label>
   <label>Lý do điều chỉnh<textarea className="field-input" required disabled={busy} maxLength={800} rows={2} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ví dụ: Thông số trong hồ sơ chưa đúng với hiện trạng"/></label>
   {reason.trim()&&reviewed.errors.length>0&&<small className="aurel-proposal-hint" role="status">{reviewed.errors.join(' ')}</small>}
   {notice&&<p role="alert">{notice}</p>}
   <Btn type="submit" kind="outline" icon="document" disabled={!canSubmit||busy||!reviewed.valid} busy={busy}>{busy?'Đang gửi…':'Gửi đề nghị'}</Btn>
  </form>}
  {requests.filter(request=>String(request.unitId)===String(unit.id)).slice(0,4).map(request=><p key={request.id}><small>{OWNER_FIELD_LABELS[request.field]} · {request.status==='pending'?'Đang chờ':request.status==='approved'?'Đã duyệt':'Đã từ chối'} · {showValue(request.field,request.value)}</small></p>)}
 </details>;
}

export function OwnerChangeInbox({notify,onChanged,canSubmit=true}){
 const [requests,setRequests]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(''),[loading,setLoading]=useState(false);
 const [review,setReview]=useState(null),[unverified,setUnverified]=useState([]);
 const mounted=useRef(false),requestFence=useRef(createSessionBoundary()),actionBusy=useRef(false);
 const refresh=async()=>{
  const ticket=requestFence.current.invalidate();setLoading(true);
  try{
   const rows=await api('/owner-change-requests');
   if(!mounted.current||!requestFence.current.matches(ticket))return false;
   setRequests(rows);setUnverified([]);setError('');return true;
  }catch(e){
   if(mounted.current&&requestFence.current.matches(ticket)){setError(e.message);setRequests([])}
   return false;
  }finally{if(mounted.current&&requestFence.current.matches(ticket))setLoading(false)}
 };
 useEffect(()=>{mounted.current=true;refresh();return()=>{mounted.current=false;requestFence.current.invalidate()}},[]);
 const decide=async(request,decision)=>{
  if(actionBusy.current||!canSubmit)return;
  actionBusy.current=true;setBusy(request.id);let accepted=false;
  try{
   await api('/owner-change-requests/'+encodeURIComponent(request.id)+'/'+decision,{method:'POST'});
   accepted=true;
   if(!mounted.current)return;
   // A confirmed decision is never left as a clickable pending row during a refresh failure.
   setRequests(rows=>rows.filter(row=>row.id!==request.id));setReview(null);
   const refreshed=await refresh();
   const synchronized=await onChanged();
   if(!mounted.current)return;
   notify(refreshed&&synchronized?(decision==='approve'?'Đã duyệt và cập nhật hồ sơ căn hộ.':'Đã từ chối đề nghị.'):'Máy chủ đã nhận quyết định nhưng dữ liệu chưa đồng bộ. Hãy làm mới và đối chiếu, không gửi lại.',!(refreshed&&synchronized),true);
  }catch(e){
   if(!mounted.current)return;
   if(accepted){setReview(null);notify('Máy chủ đã nhận quyết định nhưng chưa đồng bộ được dữ liệu. Hãy đối chiếu trước khi thao tác tiếp.',true,true)}
   else{
    if(e.uncertain){setReview(null);setUnverified(ids=>ids.includes(request.id)?ids:[...ids,request.id])}
    notify(e.uncertain?'Chưa xác định kết quả duyệt. Hãy làm mới và đối chiếu trước khi gửi lại.':e.message,true,true);
    if(!e.uncertain)await refresh();
   }
  }finally{actionBusy.current=false;if(mounted.current){setBusy('');if(accepted)setReview(null)}}
 };
 return <details className="panel pad-panel aurel-owner-correction-inbox" aria-label="Đề nghị cập nhật tài sản">
  <summary><strong>Đề nghị cập nhật thông tin tài sản</strong> · {requests.length} đang chờ</summary>
  <p>Chỉ quản lý có quyền sửa căn hộ mới được duyệt. Mọi yêu cầu được đối chiếu lại quyền sở hữu và phiên bản hồ sơ tại thời điểm duyệt.</p><Btn kind="outline" icon="refresh" onClick={refresh} disabled={!!busy||loading} busy={loading}>Làm mới đề nghị</Btn>
  {loading&&<p role="status">Đang cập nhật danh sách đề nghị…</p>}
  {error&&<p role="alert">{error} <button type="button" onClick={refresh}>Thử lại</button></p>}
  {!loading&&!requests.length&&!error&&<p>Chưa có đề nghị cần xem xét.</p>}
  {requests.map(request=><article className="aurel-owned-asset-card" key={request.id}>
   <strong>{request.unitCode||request.unitId} · {OWNER_FIELD_LABELS[request.field]}</strong>
   <p>Người gửi: {request.requesterName||'Chủ sở hữu'} · {new Date(request.createdAt).toLocaleString('vi-VN')}</p>
   <p>Hiện tại: {showValue(request.field,request.previousValue)} → Đề nghị: {showValue(request.field,request.value)}</p>
   <p>Lý do: {request.reason}</p>
   {unverified.includes(request.id)&&<p role="alert">Chưa xác minh kết quả trước đó. Hãy làm mới để đối chiếu trước khi quyết định tiếp.</p>}
   <div className="aurel-owner-review-actions"><Btn icon="check" kind="primary" disabled={!canSubmit||!!busy||loading||unverified.includes(request.id)} busy={busy===request.id} onClick={()=>setReview({request,decision:'approve'})}>Duyệt cập nhật</Btn><Btn kind="outline" disabled={!canSubmit||!!busy||loading||unverified.includes(request.id)} onClick={()=>setReview({request,decision:'reject'})}>Từ chối</Btn></div>
  </article>)}
  {review&&<ConfirmDialog
   details={{
    title:review.decision==='approve'?'Xác nhận cập nhật hồ sơ căn hộ?':'Xác nhận từ chối đề nghị?',
    message:review.decision==='approve'?'Thao tác sẽ cập nhật hồ sơ chính thức sau khi máy chủ kiểm tra lại quyền sở hữu và phiên bản hồ sơ.':'Đề nghị sẽ được đánh dấu từ chối; hồ sơ căn hộ không thay đổi.',
    action:review.decision==='approve'?'Xác nhận duyệt':'Xác nhận từ chối',
    danger:review.decision==='approve'?false:true,
    facts:[['Căn hộ',review.request.unitCode||review.request.unitId],['Trường thay đổi',OWNER_FIELD_LABELS[review.request.field]],['Giá trị hiện tại',showValue(review.request.field,review.request.previousValue)],['Giá trị đề nghị',showValue(review.request.field,review.request.value)]]
   }}
   busy={!!busy}
   onClose={()=>{if(!busy)setReview(null)}}
   onConfirm={()=>decide(review.request,review.decision)}
  />}
 </details>;
}
