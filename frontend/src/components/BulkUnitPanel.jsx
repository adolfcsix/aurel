import React,{useEffect,useState,useRef} from 'react';
import {api} from '../lib/http.js';
import {Btn,Icon} from './Ui.jsx';
import {isoToday} from '../lib/finance.js';
import {isOutcomeUncertain} from '../lib/commit-safety.js';
import {createSubmissionGate,submissionLockedMessage} from '../lib/submission-gate.js';
import {containModalTab,topmostModal} from '../lib/modal-focus.js';

const fields=[
 {key:'floor',label:'Tầng',type:'text'},
 {key:'room',label:'Số phòng / căn',type:'text'},
 {key:'interiorStatus',label:'Tình trạng nội thất',type:'interior'},
 {key:'interiorNotes',label:'Ghi chú nội thất',type:'text'},
 {key:'floorId',label:'Liên kết tầng',type:'floor'},
 {key:'roomId',label:'Liên kết phòng',type:'room'},
 {key:'address',label:'Địa chỉ',type:'text'},
 {key:'managerId',label:'Nhân viên phụ trách',type:'staff'},
 {key:'saleId',label:'Nhân viên kinh doanh',type:'staff'},
 {key:'feePercent',label:'Phí quản lý (%)',type:'percent'},
 {key:'feeBasis',label:'Cơ sở tính phí',type:'basis'},
 {key:'projectId',label:'Chuyển sang dự án',type:'project'},
 {key:'buildingId',label:'Chuyển sang tòa nhà',type:'building'}
];
export default function BulkUnitPanel({ids,data,onClose,onCommitted,onUncertain,canCommit}){
 const [field,setField]=useState('managerId');
 const [value,setValue]=useState('');
 const [effectiveFrom,setEffectiveFrom]=useState(isoToday());
 const [reason,setReason]=useState('Điều chỉnh danh mục theo phân công');
 const [preview,setPreview]=useState(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const gate=useRef(createSubmissionGate()),dialogRef=useRef(null),previewPending=useRef(false);
 const [locked,setLocked]=useState(false);
 useEffect(()=>{const previous=document.activeElement,old=document.body.style.overflow,dialog=dialogRef.current;document.body.style.overflow='hidden';dialog?.querySelector('.field-input')?.focus({preventScroll:true});const guard=event=>{if(!topmostModal(dialog)||dialog?.contains(event.target))return;(dialog?.querySelector('button:not(:disabled),input:not(:disabled),select:not(:disabled)')||dialog)?.focus({preventScroll:true})};document.addEventListener('focusin',guard);return()=>{document.removeEventListener('focusin',guard);document.body.style.overflow=old;if(previous?.isConnected)previous.focus({preventScroll:true})}},[]);
 const onKeyDown=event=>{if(!topmostModal(dialogRef.current))return;if(event.key==='Escape'&&!busy){event.preventDefault();event.stopPropagation();onClose();return}containModalTab(event,dialogRef.current,dialogRef.current?.querySelector('button:not(:disabled),input:not(:disabled)')||dialogRef.current)};
 const option=fields.find(f=>f.key===field);
 const isFee=['feePercent','feeBasis'].includes(field);
 const payload=()=>({ids,changes:{[field]:value},...(isFee?{feeEffectiveFrom:effectiveFrom,feeReason:reason}:{})});
 const invalidate=()=>{setPreview(null);setError('')};
 async function showPreview(){if(previewPending.current||busy||locked)return;previewPending.current=true;setBusy(true);setError('');try{
  const response=await api('/units/bulk/preview',{method:'POST',body:payload()});setPreview(response);
 }catch(e){setPreview(null);setError(e.message)}finally{previewPending.current=false;setBusy(false)}}
 async function confirm(){
  if(!preview||canCommit?.()===false||!gate.current.begin())return;
  setBusy(true);setError('');
  try{
   const result=await api('/units/bulk/commit',{method:'POST',body:{...payload(),fingerprint:preview.fingerprint}});
   gate.current.confirmed();setLocked(true);
   await onCommitted(result);
  }catch(e){
   setPreview(null);
   if(isOutcomeUncertain(e)){
    gate.current.uncertain();setLocked(true);setError(submissionLockedMessage);await onUncertain?.();
   }else{
    gate.current.rejected();setError(gate.current.locked?submissionLockedMessage:e.message);
   }
  }finally{setBusy(false)}
 }
 function inputValue(){
  if(option.type==='text')return <input className="field-input" value={value} onChange={e=>{setValue(e.target.value);invalidate()}} placeholder="Cho phép để trống"/>;
  if(option.type==='percent')return <input className="field-input" type="number" min="0" max="100" step="any" value={value} onChange={e=>{setValue(e.target.value);invalidate()}} placeholder="VD: 3.7"/>;
  const source=option.type==='staff'?data.staff:option.type==='project'?data.projects:option.type==='building'?data.buildings:option.type==='floor'?data.floors:option.type==='room'?data.rooms:null;
  const choices=option.type==='basis'?[{id:'due',name:'Theo tiền thuê phát sinh'},{id:'paid',name:'Theo tiền đã thu'}]:option.type==='interior'?[{id:'unfurnished',name:'Không có nội thất'},{id:'partial',name:'Nội thất cơ bản / một phần'},{id:'furnished',name:'Nội thất đầy đủ'}]:source||[];
  return <select className="field-input" value={value} onChange={e=>{setValue(e.target.value);invalidate()}}><option value="">{option.type==='basis'?'Chọn cơ sở tính':'Bỏ trống / bỏ phân công'}</option>{choices.map(x=><option key={x.id} value={x.id}>{x.name||x.code||x.id}</option>)}</select>;
 }
 return <div className="overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}><section className="editor bulk-unit-editor" ref={dialogRef} onKeyDown={onKeyDown} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="bulk-title"><div className="editor-head"><div><div className="eyebrow">DANH MỤC / ĐIỀU CHỈNH HÀNG LOẠT</div><h2 id="bulk-title">Chỉnh sửa nhiều căn hộ</h2><p>{ids.length} căn đã chọn · Xem trước mọi thay đổi trước khi lưu</p></div><button className="icon-btn" type="button" aria-label="Đóng" onClick={onClose} disabled={busy}><Icon name="x"/></button></div><div className="editor-body"><div className="bulk-stage"><span>01. Chọn thông số</span><span>02. Xem trước</span><span>03. Xác nhận</span></div><div className="bulk-fields"><label className="form-field"><span>Thông số cần cập nhật</span><select className="field-input" value={field} onChange={e=>{setField(e.target.value);setValue('');invalidate()}}>{fields.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}</select></label><label className="form-field"><span>Giá trị mới</span>{inputValue()}</label></div>{isFee&&<div className="bulk-fields"><label className="form-field"><span>Ngày áp dụng phí</span><input className="field-input" type="date" value={effectiveFrom} min={isoToday()} onChange={e=>{setEffectiveFrom(e.target.value);invalidate()}}/></label><label className="form-field"><span>Lý do điều chỉnh</span><input className="field-input" value={reason} onChange={e=>{setReason(e.target.value);invalidate()}}/></label></div>}<div className="bulk-safe-note"><Icon name="shield" size={18}/> Chỉ cập nhật trường đã chọn. Không sửa tiền thuê, giao dịch đã ghi nhận hoặc cọc qua thao tác hàng loạt.</div>{preview&&<div className="bulk-review" aria-live="polite"><div className="bulk-review-header"><b>{preview.changed} / {preview.total} căn có thay đổi</b><small>Kiểm tra lại mã căn trước khi xác nhận</small></div><div className="bulk-review-list">{preview.rows.map(row=><div key={row.id}><strong>{row.code}</strong><span>{row.changedFields.length?row.changedFields.join(', '):'Không có thay đổi'}</span></div>)}</div></div>}{locked&&<div className="aurel-reconcile-note" role="alert"><Icon name="shield" size={18}/><span>{submissionLockedMessage}</span></div>}{error&&!locked&&<div className="inline-error" role="alert">{error}</div>}</div><div className="editor-foot"><span><Icon name="shield" size={16}/> Có lưu nhật ký từng căn và chặn dữ liệu đã thay đổi</span><div><Btn onClick={onClose} disabled={busy}>Hủy</Btn>{!preview?<Btn kind="primary" icon="search" onClick={showPreview} disabled={busy||!ids.length}>{busy?'Đang kiểm tra':'Xem trước'}</Btn>:<Btn kind="primary" icon="check" onClick={confirm} disabled={busy||locked||!preview.changed}>{busy?'Đang cập nhật':'Xác nhận cập nhật'}</Btn>}</div></div></section></div>;
}
