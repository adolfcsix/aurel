import React,{useEffect,useId,useRef,useState} from 'react';
import {Icon} from './Ui.jsx';
import {accountDisplayName,accountInitial} from '../lib/account-presentation.js';

export default function AccountMenu({user,roleName,onSettings,onPassword,onLogout}){
 const [open,setOpen]=useState(false),root=useRef(null),trigger=useRef(null),menuId=useId();
 const name=accountDisplayName(user);
 useEffect(()=>{
  if(!open)return;
  const closeOnOutside=(event)=>{if(!root.current?.contains(event.target))setOpen(false)};
  const closeOnEsc=(event)=>{if(event.key==='Escape'){event.preventDefault();setOpen(false);trigger.current?.focus({preventScroll:true})}};
  document.addEventListener('pointerdown',closeOnOutside);
  document.addEventListener('keydown',closeOnEsc);
  return()=>{document.removeEventListener('pointerdown',closeOnOutside);document.removeEventListener('keydown',closeOnEsc)};
 },[open]);
 const moveMenu=e=>{
  const items=[...root.current?.querySelectorAll('[role="menuitem"]')||[]];
  if(!items.length)return;
  if(e.key==='Escape'){e.preventDefault();setOpen(false);trigger.current?.focus();return;}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
  e.preventDefault();const current=items.indexOf(document.activeElement);
  const next=e.key==='Home'?0:e.key==='End'?items.length-1:e.key==='ArrowDown'?(current+1)%items.length:(current<0?items.length-1:(current+items.length-1)%items.length);
  items[next]?.focus();
 };
 const openWithFocus=(last=false)=>{setOpen(true);requestAnimationFrame(()=>{const items=[...root.current?.querySelectorAll('[role="menuitem"]')||[]];(last?items.at(-1):items[0])?.focus({preventScroll:true})})};
 const toggle=()=>{if(open){setOpen(false);trigger.current?.focus({preventScroll:true});return;}openWithFocus()};
 const triggerKeys=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();openWithFocus(e.key==='ArrowUp')}};
 const run=(action)=>{setOpen(false);trigger.current?.focus({preventScroll:true});action()};
 return <div className="aurel-account-menu" ref={root}>
  <button type="button" ref={trigger} className="aurel-account-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} aria-label={'Tài khoản '+name} onClick={toggle} onKeyDown={triggerKeys}>
   <span className="aurel-account-avatar">{accountInitial(user)}</span>
   <span className="aurel-account-info"><strong>{name}</strong><small>{roleName}</small></span><Icon name="chevron" size={15} className={open?'aurel-account-chevron opened':'aurel-account-chevron'}/>
  </button>
  {open&&<div className="aurel-account-popover" id={menuId} role="menu" onKeyDown={moveMenu} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false)}} aria-label="Tài khoản và bảo mật"><div role="presentation" className="aurel-account-popover-head"><span>TÀI KHOẢN CÁ NHÂN</span><strong>{name}</strong><small>@{user.username} · {roleName}</small></div><button type="button" role="menuitem" onClick={()=>run(onSettings)}><Icon name="settings" size={17}/> {user.role==='admin'?'Cài đặt và phân quyền':'Cài đặt tài khoản'}</button><button type="button" role="menuitem" onClick={()=>run(onPassword)}><Icon name="shield" size={17}/> Đổi mật khẩu</button><div role="separator" className="aurel-account-popover-divider"/><button type="button" role="menuitem" className="aurel-account-signout" onClick={()=>run(onLogout)}><Icon name="arrowRight" size={17}/> Đăng xuất</button></div>}
 </div>;
}
