/** One language and identity contract for account-facing surfaces. */
import {sameDossierId} from './dossier-id.js';

export const accountStateLabels=Object.freeze({
 active:'Đang hoạt động',
 pending_activation:'Chờ kích hoạt',
 disabled:'Đã khóa'
});

/** Follow the API precedence: a disabled login stays disabled, even if activation is pending. */
export function accountState(user={}){
 if(user.status==='disabled'||user.accessStatus==='disabled')return 'disabled';
 if(user.accessStatus==='pending_activation'||user.mustChangePassword===true)return 'pending_activation';
 return 'active';
}
export function accountDisplayName(user={}){
 return String(user.name||'').trim()||String(user.username||'').trim()||'Tài khoản';
}
export function accountInitial(user={}){
 return Array.from(accountDisplayName(user))[0]?.toLocaleUpperCase('vi')||'A';
}
export function accountIsCurrent(user,currentUserId){return sameDossierId(user?.id,currentUserId);}
export function accountMayReset(user,currentUserId){return user?.id!=null&&String(user.id).trim()!==''&&!accountIsCurrent(user,currentUserId)&&user?.status!=='pending'&&accountState(user)!=='disabled';}
export function accountSearchText(value){
 return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLocaleLowerCase('vi').trim();
}
export function accountVisibleRows(users=[],{filter='all',search='',roleNames={}}={}){
 const q=accountSearchText(search);
 return (Array.isArray(users)?users:[]).filter(user=>{
  if(filter!=='all'&&accountState(user)!==filter)return false;
  return !q||accountSearchText([user.name,user.username,roleNames[user.role]||user.role].filter(Boolean).join(' ')).includes(q);
 });
}
export function accountSummary(users=[]){
 const rows=Array.isArray(users)?users:[];
 return {total:rows.length,pending:rows.filter(u=>accountState(u)==='pending_activation').length,locked:rows.filter(u=>accountState(u)==='disabled').length};
}
