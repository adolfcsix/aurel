import React,{useEffect,useId,useRef,useState} from 'react';
import {api} from '../lib/http.js';
import {Icon} from './Ui.jsx';
import BrandWordmark from './BrandWordmark.jsx';
import {passwordMeetsActivationPolicy} from '../lib/atelier-fields.js';

export default function AuthPortal({onLogin,onRegistered,loading=false,error}){
 const [mode,setMode]=useState('login');
 const [username,setUsername]=useState('');
 const [name,setName]=useState('');
 const [password,setPassword]=useState('');
 const [tempPassword,setTempPassword]=useState('');
 const [newPassword,setNewPassword]=useState('');
 const [confirmPassword,setConfirmPassword]=useState('');
 const [showPassword,setShowPassword]=useState(false);
 const [showNewPassword,setShowNewPassword]=useState(false);
 const [pending,setPending]=useState(false);
 const [localError,setLocalError]=useState('');
 const [success,setSuccess]=useState('');
 const submitLock=useRef(false),id=useId();
 const busy=loading||pending;
 useEffect(()=>setLocalError(''),[mode]);
 const changeMode=next=>{if(next===mode||busy||submitLock.current)return;setLocalError('');setSuccess('');setPassword('');setTempPassword('');setNewPassword('');setConfirmPassword('');setShowPassword(false);setShowNewPassword(false);setMode(next)};
 const registration=mode==='register',activation=mode==='activate',help=mode==='help';
 const settingPassword=registration||activation;
 const submit=async event=>{
  event.preventDefault();if(busy||submitLock.current)return;setLocalError('');setSuccess('');
  if(!username.trim()){setLocalError('Nhập tên đăng nhập.');return}
  if(settingPassword){
   if(newPassword!==confirmPassword){setLocalError('Mật khẩu xác nhận chưa khớp.');return}
   if(!passwordMeetsActivationPolicy(newPassword)){setLocalError('Mật khẩu cần 12–128 ký tự, gồm chữ và số.');return}
   if(registration&&name.trim().length<2){setLocalError('Họ và tên cần ít nhất 2 ký tự.');return}
  }
  submitLock.current=true;setPending(true);
  try{
   if(mode==='login'){await onLogin(username.trim(),password);return}
   if(!settingPassword)return;
   if(registration){
    const response=await api('/auth/register',{method:'POST',body:{username:username.trim(),name:name.trim(),password:newPassword}});
    setNewPassword('');setConfirmPassword('');setPassword('');
    await onRegistered?.(response);
   }else{
    await api('/auth/activate',{method:'POST',body:{username:username.trim(),temporaryPassword:tempPassword,newPassword}});
    setTempPassword('');setNewPassword('');setConfirmPassword('');setPassword('');setMode('login');
    setSuccess('Đã đặt mật khẩu. Bạn có thể đăng nhập.');
   }
  }catch(ex){setLocalError(ex.message)}finally{submitLock.current=false;setPending(false)}
 };
 const passwordHint=id+'-password-hint',usernameHint=id+'-username-hint';
 return <div className="aurel-auth aurel-entry">
  <aside className="aurel-entry-gallery" aria-label="AUREL">
   <div className="aurel-auth-brand aurel-auth-brand--image"><BrandWordmark/></div>
   <figure className="aurel-entry-portrait" aria-hidden="true"><img src="/images/estate-architecture.svg" alt=""/></figure>
   <div className="aurel-entry-signature"><p>Quản lý tài sản</p><span>PROPERTY WORKSPACE</span></div>
  </aside>
  <main className="aurel-entry-access">
   <div className="aurel-entry-sheet">
    {!help&&!activation&&<nav className="aurel-auth-switch" aria-label="Tài khoản"><button aria-pressed={!registration} className={!registration?'active':''} type="button" disabled={busy} onClick={()=>changeMode('login')}>Đăng nhập</button><button aria-pressed={registration} className={registration?'active':''} type="button" disabled={busy} onClick={()=>changeMode('register')}>Đăng ký</button></nav>}
    <header className="aurel-entry-heading"><span>AUREL / TÀI KHOẢN</span><h1>{help?'Quên mật khẩu?':activation?'Đặt mật khẩu':registration?'Đăng ký':'Đăng nhập'}</h1></header>
    {!help?<form className="aurel-auth-form" onSubmit={submit} aria-label={activation?'Kích hoạt tài khoản':registration?'Đăng ký tài khoản':'Đăng nhập AUREL'}>
     <fieldset className="aurel-entry-fields" disabled={busy}>
      <legend className="sr-only">Thông tin tài khoản</legend>
      {registration&&<div className="aurel-entry-field"><label htmlFor={id+'-name'}>Họ và tên</label><div className="aurel-auth-input"><input id={id+'-name'} autoComplete="name" required minLength={2} maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></div></div>}
      <div className="aurel-entry-field"><label htmlFor={id+'-username'}>Tên đăng nhập</label><div className="aurel-auth-input"><input id={id+'-username'} autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={registration?3:undefined} maxLength={80} aria-describedby={registration?usernameHint:undefined} value={username} onChange={e=>setUsername(e.target.value)}/></div>{registration&&<small id={usernameHint}>3–80 ký tự: chữ không dấu, số, dấu . _ -</small>}</div>
      {mode==='login'?<div className="aurel-entry-field"><div className="aurel-auth-label-row"><label htmlFor={id+'-password'}>Mật khẩu</label><button type="button" className="aurel-auth-textbutton" onClick={()=>changeMode('help')}>Quên mật khẩu?</button></div><div className="aurel-auth-input"><input id={id+'-password'} type={showPassword?'text':'password'} autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" className="aurel-auth-reveal" onClick={()=>setShowPassword(x=>!x)} aria-label={showPassword?'Ẩn mật khẩu':'Hiện mật khẩu'} aria-pressed={showPassword}>{showPassword?'Ẩn':'Hiện'}</button></div></div>:<>
       {activation&&<div className="aurel-entry-field"><label htmlFor={id+'-temporary'}>Mật khẩu tạm</label><div className="aurel-auth-input"><input id={id+'-temporary'} type="password" autoComplete="current-password" required value={tempPassword} onChange={e=>setTempPassword(e.target.value)}/></div></div>}
       <div className="aurel-entry-field"><label htmlFor={id+'-new'}>{registration?'Mật khẩu':'Mật khẩu mới'}</label><div className="aurel-auth-input"><input id={id+'-new'} type={showNewPassword?'text':'password'} autoComplete="new-password" required minLength={12} maxLength={128} aria-describedby={passwordHint} value={newPassword} onChange={e=>setNewPassword(e.target.value)}/><button type="button" className="aurel-auth-reveal" aria-label={showNewPassword?'Ẩn mật khẩu mới':'Hiện mật khẩu mới'} aria-pressed={showNewPassword} onClick={()=>setShowNewPassword(x=>!x)}>{showNewPassword?'Ẩn':'Hiện'}</button></div><small id={passwordHint}>12–128 ký tự, gồm chữ và số.</small></div>
       <div className="aurel-entry-field"><label htmlFor={id+'-confirm'}>Nhập lại mật khẩu</label><div className="aurel-auth-input"><input id={id+'-confirm'} type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></div></div>
      </>}
     </fieldset>
     {(localError||(mode==='login'&&error))&&<div className="aurel-auth-error" role="alert"><Icon name="alert" size={17}/>{localError||error}</div>}
     {success&&<div className="aurel-auth-success" role="status"><Icon name="check" size={17}/>{success}</div>}
     <button className="aurel-auth-submit" type="submit" disabled={busy} aria-busy={busy}>{busy?'Đang xử lý…':activation?'Lưu mật khẩu':registration?'Tạo tài khoản':'Đăng nhập'}<Icon name="arrowRight" size={18}/></button>
     {registration&&<p className="aurel-entry-note">Tài khoản mới có quyền Người xem.</p>}
     {activation&&<button className="aurel-auth-textbutton aurel-entry-back" disabled={busy} type="button" onClick={()=>changeMode('login')}>Quay lại đăng nhập</button>}
    </form>:<section className="aurel-entry-help"><p>Liên hệ quản trị viên để được cấp mật khẩu tạm.</p><button className="aurel-auth-submit" type="button" onClick={()=>changeMode('activate')}>Dùng mật khẩu tạm <Icon name="arrowRight" size={18}/></button><button className="aurel-auth-textbutton aurel-entry-back" type="button" onClick={()=>changeMode('login')}>Quay lại đăng nhập</button></section>}
   </div>
   <footer className="aurel-entry-footer">© {new Date().getFullYear()} AUREL</footer>
  </main>
 </div>;
}
