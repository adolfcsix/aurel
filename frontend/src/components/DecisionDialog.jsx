import React,{useEffect,useRef,useState} from 'react';
import {Btn,Icon} from './Ui.jsx';
import {dmy,money} from '../lib/finance.js';
import {containModalTab,topmostModal} from '../lib/modal-focus.js';

const templates={
 reverse:{title:'Điều chỉnh giao dịch thu',eyebrow:'ĐỐI SOÁT KHOẢN THU',label:'Lý do đảo giao dịch',hint:'Ghi rõ lý do để người đối soát có thể kiểm tra về sau.',button:'Tiếp tục kiểm tra',minimum:5,placeholder:'Ví dụ: Ghi nhận sai kỳ thanh toán'},
 reject:{title:'Từ chối đề nghị hoàn cọc',eyebrow:'PHÊ DUYỆT HỒ SƠ',label:'Lý do từ chối',hint:'Lý do sẽ được lưu cùng hồ sơ đề nghị.',button:'Tiếp tục từ chối',minimum:5,placeholder:'Nêu rõ nội dung cần bổ sung hoặc điều chỉnh'},
 execute:{title:'Xác nhận chứng từ chi hoàn cọc',eyebrow:'XÁC NHẬN KHOẢN CHI',label:'Mã giao dịch / số phiếu chi',hint:'Chỉ tiếp tục sau khi khoản tiền đã thực sự được chuyển hoặc chi.',button:'Xem lại xác nhận chi',minimum:4,placeholder:'Nhập mã chuyển khoản hoặc số phiếu chi'}
};
export default function DecisionDialog({decision,onClose,onContinue}){
 const [value,setValue]=useState('');const [touched,setTouched]=useState(false);const inputRef=useRef(null),rootRef=useRef(null);
 const config=templates[decision.type],row=decision.row;
 useEffect(()=>{const prev=document.activeElement;const overflow=document.body.style.overflow;const dialog=rootRef.current;document.body.style.overflow='hidden';inputRef.current?.focus({preventScroll:true});const guard=event=>{if(topmostModal(dialog)&&!dialog?.contains(event.target))(inputRef.current||dialog)?.focus({preventScroll:true})};document.addEventListener('focusin',guard);return()=>{document.removeEventListener('focusin',guard);document.body.style.overflow=overflow;if(prev?.isConnected)prev.focus({preventScroll:true})}},[]);
 const handleKeys=e=>{if(!topmostModal(rootRef.current))return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();return}containModalTab(e,rootRef.current,inputRef.current||rootRef.current)};
 const invalid=value.trim().length<config.minimum;
 const submit=e=>{e.preventDefault();setTouched(true);if(invalid)return;onContinue(value.trim())};
 return <div className="overlay aurel-decision-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="aurel-decision" ref={rootRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="aurel-decision-title" aria-describedby="aurel-decision-hint" onKeyDown={handleKeys}>
  <div className="aurel-decision-top"><span>{config.eyebrow}</span><button type="button" onClick={onClose} aria-label="Đóng"><Icon name="x" size={18}/></button></div>
  <h2 id="aurel-decision-title">{config.title}</h2><p id="aurel-decision-hint">{config.hint}</p>
  <dl className="aurel-decision-facts"><div><dt>Căn hộ</dt><dd>{decision.unitCode||'—'}</dd></div>{decision.type==='reverse'?<><div><dt>Kỳ thu</dt><dd>{row.period||'—'}</dd></div><div><dt>Giao dịch đã ghi nhận</dt><dd>{money(row.amount)}</dd></div><div><dt>Ngày thu</dt><dd>{dmy(row.date)}</dd></div></>:<><div><dt>Khoản đề nghị hoàn</dt><dd>{money(row.refund)}</dd></div><div><dt>Khoản đối trừ</dt><dd>{money(row.deduction)}</dd></div><div><dt>Trạng thái đề nghị</dt><dd>{row.status==='approved'?'Đã duyệt, chờ xác nhận chi':'Đang chờ phê duyệt'}</dd></div></>}</dl>
  {decision.type==='execute'&&<div className="aurel-decision-warning"><Icon name="shield" size={18}/> Hệ thống sẽ trừ số dư cọc khi bạn xác nhận đã chi. Không dùng thao tác này để lên lịch chuyển tiền.</div>}
  <form onSubmit={submit}><label className="aurel-decision-field"><span>{config.label} <em>· Bắt buộc</em></span><input ref={inputRef} value={value} onChange={e=>{setValue(e.target.value);setTouched(true)}} maxLength={decision.type==='execute'?120:256} aria-invalid={touched&&invalid} aria-describedby={touched&&invalid?'aurel-decision-error':undefined} placeholder={config.placeholder}/></label>{touched&&invalid&&<p className="aurel-decision-error" id="aurel-decision-error" role="alert">Vui lòng nhập ít nhất {config.minimum} ký tự có ý nghĩa.</p>}<div className="aurel-decision-footer"><Btn onClick={onClose}>Quay lại</Btn><Btn kind="primary" type="submit" disabled={invalid}>{config.button}</Btn></div></form>
 </section></div>;
}
