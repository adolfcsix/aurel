import React,{useEffect,useId,useRef,useState} from 'react';
import {Icon} from './Ui.jsx';
import {containModalTab,topmostModal} from '../lib/modal-focus.js';
/** Shared focus-managed overlay: no backdrop close that could discard context accidentally. */
export default function DossierFrame({title,overline,subtitle,signature='HỒ SƠ TÀI SẢN',children,actions,onClose,onBack,sections=[],extraClass=''}){
 const headingId=useId(),container=useRef(null),close=useRef(null);
 const [activeSection,setActiveSection]=useState(sections[0]?.key||'');
 // A modal must keep focus inside even when another element receives focus
 // programmatically (e.g. browser autofill or a stale async callback).
 useEffect(()=>{
  const dialog=container.current;
  const previous=document.activeElement,old=document.body.style.overflow;
  const guardFocus=event=>{
   // Only the uppermost modal may reclaim focus when dialogs are nested.
   if(!topmostModal(dialog)||dialog.contains(event.target))return;
   close.current?.focus({preventScroll:true});
  };
  document.body.style.overflow='hidden';
  document.addEventListener('focusin',guardFocus);
  close.current?.focus({preventScroll:true});
  return()=>{
   document.removeEventListener('focusin',guardFocus);
   document.body.style.overflow=old;
   if(previous?.isConnected)previous.focus({preventScroll:true});
  };
 },[]);
 useEffect(()=>{
  if(!sections.some(section=>section.key===activeSection))setActiveSection(sections[0]?.key||'');
 },[sections.map(section=>section.key).join('|')]);
 useEffect(()=>{
  const scroller=container.current?.querySelector('.aurel-dossier-scroll');
  if(!scroller||!sections.length||typeof IntersectionObserver==='undefined')return;
  const headings=[...scroller.querySelectorAll('[data-aurel-dossier-section]')];
  const observer=new IntersectionObserver(entries=>{const visible=entries.filter(x=>x.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);if(visible[0])setActiveSection(visible[0].target.dataset.aurelDossierSection);},{root:scroller,rootMargin:'-8% 0px -63% 0px',threshold:0});
  headings.forEach(el=>observer.observe(el));return()=>observer.disconnect();
 },[sections.map(s=>s.key).join('|')]);
 const jumpTo=key=>{setActiveSection(key);const target=[...container.current.querySelectorAll('[data-aurel-dossier-section]')].find(el=>el.dataset.aurelDossierSection===key);if(!target)return;target.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});target.querySelector('h3')?.focus({preventScroll:true});};
 const keydown=e=>{
  if(!topmostModal(container.current))return;
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();return;}
  containModalTab(e,container.current,close.current);
 };
 return <div className="aurel-dossier-veil" role="presentation"><section className={'aurel-dossier-sheet '+extraClass} role="dialog" aria-modal="true" aria-labelledby={headingId} ref={container} onKeyDown={keydown}>
  <div className="aurel-dossier-top"><span className="aurel-dossier-signature">AUREL <i>/</i> {signature}</span>{onBack&&<button className="aurel-dossier-back" type="button" onClick={onBack}><Icon name="back" size={16}/> Hồ sơ trước</button>}<button ref={close} type="button" className="aurel-dossier-close" onClick={onClose}><Icon name="x" size={17}/> Đóng hồ sơ</button></div>
  <header className="aurel-dossier-hero"><div className="aurel-dossier-hero-copy"><p className="aurel-dossier-eyebrow">{overline}</p><h2 id={headingId}>{title||'Hồ sơ chưa đặt tên'}</h2>{subtitle&&<p>{subtitle}</p>}</div></header>
  <div className="aurel-dossier-scroll">{sections.length>0&&<nav className="aurel-dossier-contents" aria-label="Chuyển nhanh trong hồ sơ"><span>Trong hồ sơ</span><div>{sections.map(({key,label},i)=><button key={key} type="button" onClick={()=>jumpTo(key)} aria-current={activeSection===key?"location":undefined} aria-label={"Đến phần "+label}><small>{String(i+1).padStart(2,"0")}</small>{label}</button>)}</div></nav>}{children}</div>
  <footer className="aurel-dossier-bottom"><div className="aurel-dossier-trust"><Icon name="shield" size={16}/> Chỉ hiển thị thông tin trong phạm vi quyền truy cập.</div><div className="aurel-dossier-buttons">{actions}</div></footer>
 </section></div>;
}
export function DossierBlock({eyebrow,title,description,children,sectionKey}){return <section className="aurel-dossier-block" data-aurel-dossier-section={sectionKey}><div className="aurel-dossier-block-heading"><span>{eyebrow}</span><h3 tabIndex={-1}>{title}</h3>{description&&<p>{description}</p>}</div><div className="aurel-dossier-block-content">{children}</div></section>}
export function DossierDetail({label,children}){const empty=children===null||children===undefined||children==='';return <div className={'aurel-dossier-detail'+(empty?' is-empty':'')}><span>{label}</span><strong>{empty?'Chưa cập nhật':children}</strong></div>}
/** Shared presentation for related properties and contract records. */
export function DossierRecord({eyebrow,title,meta,status,action,children}){return <article className="aurel-dossier-record">
 <div><span className="aurel-dossier-record-kicker">{eyebrow}</span><strong>{title}</strong>{meta&&<p>{meta}</p>}{children}</div>
 {(status||action)&&<div className="aurel-dossier-record-end">{status}{action}</div>}
</article>}

export function DossierEmpty({children}){return <p className="aurel-dossier-empty">{children}</p>}

/** Same visual hierarchy in every read-only dossier, without new cards. */
export function DossierStat({label,value,note,valueClassName=''}){return <div><span>{label}</span><strong className={valueClassName}>{value}</strong>{note&&<small>{note}</small>}</div>}
