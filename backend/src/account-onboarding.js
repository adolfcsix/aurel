import {hashPassword,verifyPassword} from './security.js';
import {fail,log,create,find,active,samePersistedId} from './domain.js';

export const validateNewPassword=(password)=>{
 if(typeof password!=='string'||password.length<12||password.length>128||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password))fail('Mật khẩu cần 12–128 ký tự, gồm chữ và số');
 return password;
};

// Internal access only: an administrator provisions an account and one-time
// password; the employee activates it and changes the secret before first login.
export function activateManagedAccount(db,{username,temporaryPassword,newPassword}){
 const handle=String(username||'').trim().toLowerCase();
 const user=db.users.find(u=>u.username.toLowerCase()===handle&&u.status!=='disabled'&&u.status!=='archived'&&u.archivedAt==null);
 if(!user||user.mustChangePassword!==true||!verifyPassword(String(temporaryPassword||''),user.passwordHash))fail('Thông tin kích hoạt không hợp lệ. Liên hệ quản trị viên để được cấp tài khoản.',401);
 validateNewPassword(newPassword);
 if(verifyPassword(newPassword,user.passwordHash))fail('Mật khẩu mới phải khác mật khẩu tạm thời');
 user.passwordHash=hashPassword(newPassword);
 user.mustChangePassword=false;
 user.activatedAt=new Date().toISOString();
 db.sessions=db.sessions.filter(s=>s.userId!==user.id);
 log(db,user,'auth.account_activated',user.id);
 return {activated:true};
}

/** Self-registration is active immediately, but never grants privileged capabilities.
 * Client-supplied role, staffId and account status are never trusted. */
export function requestWorkspaceAccount(db,{username,name,password,...extra}={}){
 if(Object.keys(extra).length)fail('Chỉ được gửi tên, tên đăng nhập và mật khẩu; quyền truy cập do quản trị viên thiết lập');
 const handle=String(username||'').trim().toLowerCase();
 if(!/^[a-z0-9_.-]{3,80}$/.test(handle))fail('Tên đăng nhập cần 3–80 ký tự: chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang');
 if(typeof username!=='string'||typeof name!=='string')fail('Tên đăng nhập và tên hiển thị phải là văn bản');
 const displayName=name.trim();
 if(displayName.length<2||displayName.length>120)fail('Tên hiển thị cần 2–120 ký tự');
 if(db.users.some(u=>String(u.username).toLowerCase()===handle))fail('Tên đăng nhập đã được sử dụng',409);
 validateNewPassword(password);
 const user=create({username:handle,name:displayName,role:'viewer',staffId:null,status:'active',mustChangePassword:false,passwordHash:hashPassword(password),registeredAt:new Date().toISOString(),favoriteUnitIds:[]});
 db.users.push(user);
 log(db,user,'auth.self_registered',user.id);
 return {userId:user.id};
}

export const accountDisplayStatus=(user)=> user.status==='disabled'?'disabled':user.mustChangePassword?'pending_activation':'active';

// Reset remains an administrator-only API operation; the domain function itself
// revokes sessions and never returns or logs the temporary password.
export function resetManagedAccount(db,userId,temporaryPassword,actor){
 validateNewPassword(temporaryPassword);
 const user=db.users.find(u=>u.id===userId&&u.status!=='archived'&&u.archivedAt==null);
 if(!user)fail('Không tìm thấy tài khoản',404);
 if(user.status==='disabled')fail('Hãy mở khóa tài khoản trước khi cấp lại mật khẩu',409);
 user.passwordHash=hashPassword(temporaryPassword);
 user.mustChangePassword=true;
 user.activatedAt=null;
 db.sessions=db.sessions.filter(s=>s.userId!==user.id);
 log(db,actor,'users.reset_access',user.id);
 return user;
}

/** Private, persisted bookmarks. A viewer may operate on their own collection
 * without acquiring unit.write or modifying any shared apartment records. */
export function updateFavoriteUnits(db,userId,unitId,enabled){
 const user=find(db.users,userId,'Tài khoản');
 const existing=Array.isArray(user.favoriteUnitIds)?user.favoriteUnitIds:[];
 if(enabled){
  const unit=db.units.find(row=>samePersistedId(row.id,unitId)&&active(row));
  if(!unit)fail('Không tìm thấy căn hộ đang hoạt động',404);
  if(!existing.some(id=>samePersistedId(id,unit.id))){
   if(existing.length>=100)fail('Chỉ lưu tối đa 100 căn quan tâm',409);
   user.favoriteUnitIds=[...existing,unit.id];
  }else user.favoriteUnitIds=existing;
 }else user.favoriteUnitIds=existing.filter(id=>!samePersistedId(id,unitId));
 return {favoriteUnitIds:[...user.favoriteUnitIds]};
}
