import React,{useEffect,useId,useState} from 'react';
import {api} from '../lib/http.js';
import {Icon} from './Ui.jsx';
import BrandWordmark from './BrandWordmark.jsx';
import {passwordMeetsActivationPolicy,passwordScore} from '../lib/atelier-fields.js';

export default function AuthPortal({onLogin,onRegistered,loading,error}){
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
 const id=useId();
 useEffect(()=>setLocalError(''),[mode]);
 const changeMode=next=>{setLocalError('');setSuccess('');setPassword('');setTempPassword('');setNewPassword('');setConfirmPassword('');setShowPassword(false);setShowNewPassword(false);setMode(next)};
 const registration=mode==='register',activation=mode==='activate',help=mode==='help';
 const settingPassword=registration||activation;
 const submit=async event=>{
  event.preventDefault();setLocalError('');setSuccess('');
  if(!username.trim()){setLocalError('Vui lòng nhập tên đăng nhập.');return}
  if(mode==='login'){onLogin(username.trim(),password);return}
  if(!settingPassword)return;
  if(newPassword!==confirmPassword){setLocalError('Hai lần nhập mật khẩu chưa khớp.');return}
  if(!passwordMeetsActivationPolicy(newPassword)){setLocalError('Mật khẩu cần 12–128 ký tự, có cả chữ và số.');return}
  if(registration&&name.trim().length<2){setLocalError('Nhập tên hiển thị có ít nhất 2 ký tự.');return}
  setPending(true);
  try{
   if(registration){
    const response=await api('/auth/register',{method:'POST',body:{username:username.trim(),name:name.trim(),password:newPassword}});
    setNewPassword('');setConfirmPassword('');setPassword('');
    await onRegistered?.(response);
   }else{
    await api('/auth/activate',{method:'POST',body:{username:username.trim(),temporaryPassword:tempPassword,newPassword}});
    setTempPassword('');setNewPassword('');setConfirmPassword('');setPassword('');setMode('login');
    setSuccess('Kích hoạt thành công. Đăng nhập bằng mật khẩu vừa thiết lập.');
   }
  }catch(ex){setLocalError(ex.message)}finally{setPending(false)}
 };
 return <div className="aurel-auth">
  <section className="aurel-auth-story" aria-label="Giới thiệu AUREL">
   <div className="aurel-auth-brand aurel-auth-brand--image"><BrandWordmark/></div>
   <div className="aurel-auth-story-main"><span className="aurel-auth-kicker"><i/> HỆ THỐNG QUẢN LÝ TÀI SẢN RIÊNG</span><h1>Quản lý tài sản.<br/><em>Chỉn chu trong từng quyết định.</em></h1><p>Hồ sơ căn hộ, hợp đồng và tài chính được quản lý thống nhất, rõ ràng và có kiểm soát truy cập.</p><div className="aurel-auth-rule"/><div className="aurel-auth-story-meta"><span>01 / TÀI SẢN</span><span>02 / VẬN HÀNH</span><span>03 / ĐỐI SOÁT</span></div></div>
   <div className="aurel-auth-story-foot"><span>SỰ TIN CẬY ĐẾN TỪ TỪNG CHI TIẾT</span><span>© 2026 AUREL</span></div>
  </section>
  <main className="aurel-auth-access">
   <div className="aurel-auth-access-top"><span className="aurel-auth-mobile-wordmark">AUREL</span><span><Icon name="shield" size={15}/> Không gian tài khoản bảo mật</span></div>
   <div className="aurel-auth-paper">
    <p className="aurel-auth-section-no">AUREL / TÀI KHOẢN</p>
    <div className="aurel-auth-heading"><h2>{help?'Hỗ trợ truy cập':activation?'Kích hoạt tài khoản cũ':registration?'Tạo tài khoản AUREL':'Đăng nhập AUREL'}</h2><p>{help?'Nếu quên mật khẩu, liên hệ quản trị viên để xác minh và khôi phục tài khoản.':activation?'Chỉ dành cho tài khoản cũ đã nhận mật khẩu tạm.':registration?'Tạo tài khoản để vào ngay không gian AUREL với các tiện ích cá nhân và quyền Người xem.':'Truy cập không gian quản lý tài sản của bạn.'}</p></div>
    {!help&&!activation&&<div className="aurel-auth-switch" aria-label="Phương thức truy cập"><button aria-pressed={!registration} className={!registration?'active':''} type="button" onClick={()=>changeMode('login')}>Đăng nhập</button><button aria-pressed={registration} className={registration?'active':''} type="button" onClick={()=>changeMode('register')}>Đăng ký tài khoản</button></div>}
    {!help?<form className="aurel-auth-form" onSubmit={submit}>
     {registration&&<><label htmlFor={id+'-name'}>Họ và tên</label><div className="aurel-auth-input"><Icon name="user" size={17}/><input id={id+'-name'} autoComplete="name" placeholder="Tên hiển thị của bạn" required minLength={2} maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></div></>}
     <label htmlFor={id+'-username'}>Tên đăng nhập</label><div className="aurel-auth-input"><Icon name="user" size={17}/><input id={id+'-username'} autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder={registration?'3–80 ký tự, chữ không dấu và số':'Nhập tên đăng nhập'} required minLength={registration?3:undefined} maxLength={80} value={username} onChange={e=>setUsername(e.target.value)}/></div>
     {mode==='login'?<><div className="aurel-auth-label-row"><label htmlFor={id+'-password'}>Mật khẩu</label><button type="button" className="aurel-auth-textbutton" onClick={()=>changeMode('help')}>Cần hỗ trợ?</button></div><div className="aurel-auth-input"><Icon name="shield" size={17}/><input id={id+'-password'} type={showPassword?'text':'password'} autoComplete="current-password" placeholder="Nhập mật khẩu" required value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" className="aurel-auth-reveal" onClick={()=>setShowPassword(x=>!x)} aria-label={showPassword?'Ẩn mật khẩu':'Hiện mật khẩu'}>{showPassword?'Ẩn':'Hiện'}</button></div></>:<>
      {activation&&<><label htmlFor={id+'-temporary'}>Mật khẩu tạm của tài khoản cũ</label><div className="aurel-auth-input"><Icon name="shield" size={17}/><input id={id+'-temporary'} type="password" autoComplete="off" placeholder="Mật khẩu tạm đã nhận trước đó" required value={tempPassword} onChange={e=>setTempPassword(e.target.value)}/></div></>}
      <label htmlFor={id+'-new'}>{registration?'Tạo mật khẩu cá nhân':'Mật khẩu cá nhân mới'}</label><div className="aurel-auth-input"><Icon name="shield" size={17}/><input id={id+'-new'} type={showNewPassword?'text':'password'} autoComplete="new-password" placeholder="Tối thiểu 12 ký tự, gồm chữ và số" required minLength={12} maxLength={128} value={newPassword} onChange={e=>setNewPassword(e.target.value)}/><button type="button" className="aurel-auth-reveal" aria-label={showNewPassword?'Ẩn mật khẩu mới':'Hiện mật khẩu mới'} onClick={()=>setShowNewPassword(x=>!x)}>{showNewPassword?'Ẩn':'Hiện'}</button></div>
      <div className="aurel-password-quality" role="status" aria-live="polite" aria-label="Đánh giá mật khẩu"><div>{[0,1,2,3].map(i=><i key={i} className={i<passwordScore(newPassword)?'filled':''}/>)}</div><span>{!newPassword?'Độ bảo vệ mật khẩu':!passwordMeetsActivationPolicy(newPassword)?'Chưa đủ điều kiện':passwordScore(newPassword)<4?'Đạt điều kiện':'Mức bảo vệ tốt'}</span></div>
      <label htmlFor={id+'-confirm'}>Xác nhận mật khẩu</label><div className="aurel-auth-input"><Icon name="check" size={17}/><input id={id+'-confirm'} type="password" autoComplete="new-password" placeholder="Nhập lại mật khẩu" required value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></div>
     </>}
     {(localError||(mode==='login'&&error))&&<div className="aurel-auth-error" role="alert"><Icon name="alert" size={17}/>{localError||error}</div>}
     {success&&<div className="aurel-auth-success" role="status"><Icon name="check" size={17}/>{success}</div>}
     <button className="aurel-auth-submit" type="submit" disabled={loading||pending} aria-busy={loading||pending}>{loading||pending?'Đang xử lý…':activation?'Kích hoạt tài khoản':registration?'Tạo tài khoản & vào AUREL':'Đăng nhập'}<Icon name="arrowRight" size={18}/></button>
     <p className="aurel-auth-hint">{registration?'Đăng ký xong vào ngay. Bạn có thể tra cứu, lưu căn quan tâm và quản lý tài khoản; các quyền nghiệp vụ cao hơn được cấp riêng.':activation?'Chế độ này chỉ dành cho tài khoản cũ cần kích hoạt.':'Dữ liệu được hiển thị theo phạm vi quyền của từng tài khoản.'}</p>
     {activation&&<button className="aurel-auth-textbutton aurel-auth-after-register" type="button" onClick={()=>changeMode('login')}>Quay lại đăng nhập</button>}
    </form>:<div className="aurel-auth-help"><div className="aurel-auth-help-icon"><Icon name="shield" size={24}/></div><h3>Hỗ trợ tài khoản</h3><p>Nếu quên mật khẩu, hãy liên hệ quản trị viên để xác minh danh tính. Không gửi mật khẩu qua biểu mẫu công khai.</p><button className="aurel-auth-submit" type="button" onClick={()=>changeMode('login')}>Quay lại đăng nhập <Icon name="arrowRight" size={18}/></button><button className="aurel-auth-textbutton aurel-auth-after-register" type="button" onClick={()=>changeMode('activate')}>Tôi có mật khẩu tạm của tài khoản cũ</button></div>}
   </div>
   <div className="aurel-auth-access-foot"><span>Bảo mật theo vai trò • Xác thực phiên truy cập</span><span>AUREL · PROPERTY WORKSPACE</span></div>
  </main>
 </div>;
}
