import React,{useEffect,useRef} from 'react';
import {Btn,Icon} from './Ui.jsx';
import {containModalTab,topmostModal} from '../lib/modal-focus.js';

export default function ConfirmDialog({details,onClose,onConfirm,busy}){
 const dialogRef=useRef(null);
 useEffect(()=>{const previous=document.activeElement;const overflow=document.body.style.overflow;const dialog=dialogRef.current;document.body.style.overflow='hidden';dialog?.querySelector('button:not(:disabled)')?.focus({preventScroll:true});const guard=event=>{if(!topmostModal(dialog)||dialog?.contains(event.target))return;(dialog?.querySelector('button:not(:disabled)')||dialog)?.focus({preventScroll:true})};document.addEventListener('focusin',guard);return()=>{document.removeEventListener('focusin',guard);document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus({preventScroll:true})}},[]);
 const onKeyDown=e=>{if(!topmostModal(dialogRef.current))return;if(e.key==='Escape'&&!busy){e.preventDefault();e.stopPropagation();onClose();return}containModalTab(e,dialogRef.current,dialogRef.current?.querySelector('button:not(:disabled)')||dialogRef.current)};
 return <div className="overlay"><div className="confirm-dialog aurel-confirm" ref={dialogRef} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby="aurel-confirm-title" aria-describedby="aurel-confirm-message" onKeyDown={onKeyDown}><div className="confirm-symbol"><Icon name="alert" size={22}/></div><h2 id="aurel-confirm-title">{details.title}</h2><p id="aurel-confirm-message">{details.message}</p>{details.facts?.length>0&&<dl className="aurel-confirm-facts">{details.facts.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}<div className="confirm-actions"><Btn onClick={onClose} disabled={busy}>Quay lại</Btn><Btn kind={details.danger===false?'primary':'danger'} busy={busy} onClick={onConfirm}>{busy?'Đang xử lý…':details.action||'Xác nhận'}</Btn></div></div></div>;
}
