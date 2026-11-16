import React,{useEffect,useRef,useState} from 'react';
import {api} from '../lib/http.js';
import {isOutcomeUncertain} from '../lib/commit-safety.js';
import {isoToday,money} from '../lib/finance.js';
import {Btn,Icon} from './Ui.jsx';
import {containModalTab,topmostModal} from '../lib/modal-focus.js';
import {protectPendingWork} from '../lib/unload-guard.js';

/** Contract closure is a two-step irreversible workflow: preview -> acknowledged commit.
 * Never resend an uncertain/acknowledged mutation when refreshing UI state fails.
 */
export default function CloseLeaseDialog({lease,unitName,onClose,onCommitted,onUncertain=()=>{},onConflict=()=>{}}){
 const dialogRef=useRef(null),writeLock=useRef(false);
 useEffect(()=>{const previous=document.activeElement,old=document.body.style.overflow;
  const dialog=dialogRef.current;document.body.style.overflow='hidden';dialog?.querySelector('input')?.focus({preventScroll:true});
  const guard=event=>{if(!topmostModal(dialog)||dialog?.contains(event.target))return;(dialog?.querySelector('button:not(:disabled),input:not(:disabled)')||dialog)?.focus({preventScroll:true})};
  document.addEventListener('focusin',guard);
  return()=>{document.removeEventListener('focusin',guard);document.body.style.overflow=old;if(previous?.isConnected)previous.focus({preventScroll:true})};},[]);
 const [effectiveOn,setEffectiveOn]=useState(isoToday()),[reason,setReason]=useState('');
 const [preview,setPreview]=useState(null),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[committed,setCommitted]=useState(false),[unknown,setUnknown]=useState(false);
 const frozen=committed||unknown;
 useEffect(()=>protectPendingWork(window,busy||unknown||(!committed&&(!!reason.trim()||effectiveOn!==isoToday()))),[busy,unknown,committed,reason,effectiveOn]);
 const change=setter=>event=>{if(frozen)return;setter(event.target.value);setPreview(null);setError('')};
 async function check(){if(writeLock.current||frozen||busy)return;
  writeLock.current=true;setBusy(true);setError('');
  try{setPreview(await api(`/leases/${lease.id}/close-preview`,{method:'POST',body:{effectiveOn}}))}
  catch(e){if(isOutcomeUncertain(e)){setUnknown(true);setError('Chưa xác minh được kết quả bước đối chiếu. Đóng hộp thoại và tải lại hồ sơ trước khi tiếp tục.');await onUncertain()}
   else setError(e.message)}
  finally{writeLock.current=false;setBusy(false)};
 }
 async function commit(){if(writeLock.current||frozen||busy||!preview||reason.trim().length<5)return;
  writeLock.current=true;setBusy(true);setError('');let acknowledged=false;
  try{
   await api(`/leases/${lease.id}/close`,{method:'POST',body:{effectiveOn,reason:reason.trim(),fingerprint:preview.fingerprint}});
   acknowledged=true;setCommitted(true);await onCommitted();
  }catch(e){
   if(acknowledged){setCommitted(true);setError('Máy chủ đã xác nhận kết thúc hợp đồng, nhưng chưa cập nhật được giao diện. Không gửi lại thao tác; đóng hộp thoại và tải lại hồ sơ.')}
   else if(isOutcomeUncertain(e)){setUnknown(true);setError('Chưa xác định được kết quả ghi nhận. Không gửi lại lệnh. Hãy tải lại và kiểm tra trạng thái hợp đồng.');await onUncertain()}
   else if(e.status===409){setPreview(null);setError('Hồ sơ hoặc kỳ thu đã thay đổi. Cần tải lại và kiểm tra bản đối chiếu trước khi xác nhận.');await onConflict()}
   else{setPreview(null);setError(e.message)}
  }finally{writeLock.current=false;setBusy(false)}
 }
 const keyDown=e=>{if(!topmostModal(dialogRef.current))return;if(e.key==='Escape'&&!busy){e.preventDefault();e.stopPropagation();onClose();return}
  containModalTab(e,dialogRef.current,dialogRef.current?.querySelector('button:not(:disabled),input:not(:disabled)')||dialogRef.current);
 };
 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}>
  <section ref={dialogRef} onKeyDown={keyDown} className="editor aurel-close-v220" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="end-lease-title" aria-describedby="end-lease-context">
   <div className="editor-head"><div><div className="eyebrow">AUREL / VÒNG ĐỜI HỢP ĐỒNG</div><h2 id="end-lease-title">Kết thúc hợp đồng</h2><p id="end-lease-context">{unitName} · Các khoản đã nhận được giữ nguyên trong lịch sử đối soát.</p></div><button type="button" className="icon-btn" disabled={busy} onClick={onClose} aria-label="Đóng hộp thoại kết thúc hợp đồng"><Icon name="x"/></button></div>
   <div className="editor-body"><div className="bulk-fields"><label className="form-field"><span>Ngày kết thúc thực tế</span><input className="field-input" type="date" max={isoToday()} value={effectiveOn} onChange={change(setEffectiveOn)} disabled={busy||frozen}/></label><label className="form-field"><span>Lý do kết thúc</span><input className="field-input" minLength={5} maxLength={500} aria-describedby="aurel-close-lease-reason-note" value={reason} onChange={change(setReason)} disabled={busy||frozen} placeholder="Ví dụ: Khách trả căn trước thời hạn"/><small id="aurel-close-lease-reason-note">Ghi rõ ít nhất 5 ký tự để đối chiếu lịch sử hợp đồng.</small></label></div>
    <div className="bulk-safe-note"><Icon name="shield" size={18}/> Kỳ thu chưa nhận tiền phát sinh sau ngày kết thúc sẽ được đánh dấu hủy. Kỳ đã thu một phần hoặc toàn bộ được giữ để kiểm tra công nợ.</div>
    {preview&&<div className="closure-review"><div><small>Kỳ tương lai được hủy</small><strong>{preview.cancelledCount}</strong><span>{money(preview.cancelledAmount)}</span></div><div><small>Kỳ cần tiếp tục đối soát</small><strong>{preview.retainedCount}</strong><span>Còn công nợ {money(preview.retainedDebt)}</span></div></div>}
    {error&&<div className="inline-error aurel-write-outcome" role="alert"><Icon name="alert" size={17}/><span>{error}</span></div>}
    {frozen&&<p className="aurel-immutable-hint"><Icon name="shield" size={17}/> Thao tác gửi lại đã được khóa để tránh ghi nhận trùng.</p>}
   </div>
   <div className="editor-foot"><span><Icon name="shield" size={16}/> Không xóa thanh toán và lịch sử hợp đồng</span><div><Btn onClick={onClose} disabled={busy}>{frozen?'Đóng để đối chiếu':'Quay lại'}</Btn>{!frozen&&(!preview?<Btn kind="primary" busy={busy} onClick={check}>{busy?'Đang đối chiếu…':'Xem trước kỳ thu'}</Btn>:<Btn kind="danger" busy={busy} disabled={reason.trim().length<5} onClick={commit}>{busy?'Đang ghi nhận…':'Xác nhận kết thúc'}</Btn>)}</div></div>
  </section>
 </div>
}
