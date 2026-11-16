import React,{useEffect,useId,useMemo,useRef,useState} from 'react';
import {Icon} from './Ui.jsx';
import {buildQuickFindIndex,findQuickResults} from '../lib/quick-find.js';
import {containModalTab,topmostModal} from '../lib/modal-focus.js';

/** Accessible, permission-scoped command surface. Never persists or transmits a query. */
export default function PrivateSearch({data,user,sections,onClose,onNavigate,onOpenUnit}){
 const [query,setQuery]=useState('');
 const [active,setActive]=useState(0);
 const rootRef=useRef(null),inputRef=useRef(null);
 const titleId=useId(),resultsId=useId(),helpId=useId();
 const index=useMemo(()=>buildQuickFindIndex(data,user,sections),[data,user,sections]);
 const results=useMemo(()=>findQuickResults(index,query),[index,query]);
 useEffect(()=>setActive(0),[query]);
 useEffect(()=>{
  const previous=document.activeElement;
  const oldOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  inputRef.current?.focus({preventScroll:true});
  const onKey=(event)=>{
   if(!topmostModal(rootRef.current))return;
   if(event.key==='Escape'){event.preventDefault();onClose();return;}
   containModalTab(event,rootRef.current,inputRef.current);
  };
  const guardFocus=event=>{if(topmostModal(rootRef.current)&&!rootRef.current?.contains(event.target))inputRef.current?.focus({preventScroll:true})};
  document.addEventListener('keydown',onKey);
  document.addEventListener('focusin',guardFocus);
  return()=>{document.removeEventListener('keydown',onKey);document.removeEventListener('focusin',guardFocus);document.body.style.overflow=oldOverflow;if(previous?.isConnected)previous.focus({preventScroll:true})};
 },[onClose]);
 const choose=(item)=>{
  onClose();
  if(item.kind==='unit')onOpenUnit(item.unitId);
  else if(item.kind==='project')onNavigate('units',{projectId:item.projectId});
  else onNavigate(item.target);
 };
 const onSearchKey=(event)=>{
  if(event.key==='ArrowDown'){event.preventDefault();setActive(x=>(x+1)%Math.max(1,results.length))}
  else if(event.key==='ArrowUp'){event.preventDefault();setActive(x=>(x-1+Math.max(1,results.length))%Math.max(1,results.length))}
  else if(event.key==='Enter'&&results.length){event.preventDefault();choose(results[active]||results[0])}
 };
 return <div className="aurel-find-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <section className="aurel-find" ref={rootRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={helpId}>
   <header className="aurel-find-header"><div><span className="aurel-find-overline">AUREL / TRA CỨU HỒ SƠ</span><h2 id={titleId}>Tìm hồ sơ & điều hướng</h2><p id={helpId}>Tra cứu trong phạm vi dữ liệu bạn được cấp quyền.</p></div><button type="button" className="aurel-find-close" onClick={onClose} aria-label="Đóng tìm kiếm"><Icon name="x" size={19}/></button></header>
   <div className="aurel-find-search"><Icon name="search" size={21}/><input ref={inputRef} aria-label="Tìm dự án, căn hộ, hợp đồng hoặc phân hệ" role="combobox" aria-autocomplete="list" aria-expanded={results.length>0} aria-controls={resultsId} aria-activedescendant={results.length?resultsId+'-'+active:undefined} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={onSearchKey} placeholder="Dự án, mã căn, hợp đồng, phân hệ…" autoComplete="off" spellCheck={false}/>{query&&<button type="button" className="aurel-find-clear" onClick={()=>{setQuery('');inputRef.current?.focus()}}>Xóa</button>}</div>
   <div className="aurel-find-list-head"><span>{query?'KẾT QUẢ PHÙ HỢP':'ĐIỀU HƯỚNG NHANH'}</span><span aria-live="polite" aria-atomic="true">{results.length} mục</span></div>
   <div id={resultsId} className="aurel-find-list" role="listbox" aria-label="Kết quả tìm kiếm">
    {results.map((item,i)=><button type="button" id={resultsId+'-'+i} role="option" aria-selected={i===active} className={'aurel-find-option '+(i===active?'is-active':'')} key={item.key} onMouseEnter={()=>setActive(i)} onClick={()=>choose(item)}><span className="aurel-find-icon"><Icon name={item.icon} size={19}/></span><span className="aurel-find-result"><strong>{item.title}</strong><small>{item.detail}</small></span><span className="aurel-find-result-hint">{item.hint}</span><Icon name="arrowRight" size={16}/></button>)}
    {!results.length&&<div className="aurel-find-empty"><Icon name="search" size={23}/><strong>Chưa tìm thấy hồ sơ phù hợp</strong><span>Không có hồ sơ phù hợp trong phạm vi truy cập.</span></div>}
   </div>

  </section>
 </div>;
}
