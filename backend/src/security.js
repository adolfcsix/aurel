import {randomBytes, scryptSync, timingSafeEqual, createHash} from 'node:crypto';
export const hashPassword=(password)=>{
 const salt=randomBytes(16).toString('hex');
 return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;
};
export const verifyPassword=(password,stored)=>{
 if(typeof stored!=='string'||!stored.includes(':'))return false;
 const [salt,expected]=stored.split(':');
 try{const actual=scryptSync(password,salt,64),reference=Buffer.from(expected,'hex');return actual.length===reference.length&&timingSafeEqual(actual,reference)}catch{return false}
};
/**
 * The credential check precedes an asynchronous updateDb transaction. Recheck
 * the exact account snapshot AT COMMIT to prevent an in-flight login from
 * creating a session after an administrator disables/resets that account.
 * This guard does not mutate either object and is safe to test without Express.
 */
export function canCommitLogin(snapshot,current,username){
 if(!snapshot||!current||snapshot.id!==current.id)return false;
 if(typeof current.username!=='string'||current.username.toLowerCase()!==username)return false;
 if(typeof current.passwordHash!=='string'||current.passwordHash!==snapshot.passwordHash)return false;
 if(current.archivedAt!=null||current.mustChangePassword===true)return false;
 return current.status==null||current.status==='active'||
  (current.status==='pending'&&current.role==='viewer');
}
/** Re-authorize sensitive writes at their serialization point, not only when
 * Express parsed the cookie.  The request snapshot may be stale after a
 * concurrent password reset, deactivation, demotion, or session revocation.
 * Keep the check pure so JSON and PostgreSQL updateDb use the same contract.
 */
export function canCommitSessionMutation(db,requestUser,requestSession,{role,permission}={}){
 if(!db||!requestUser||!requestSession)return false;
 const current=(db.users||[]).find(user=>user.id===requestUser.id);
 const live=(db.sessions||[]).find(session=>session.id===requestSession.id&&session.userId===requestUser.id&&Number(session.expiresAt)>Date.now());
 if(!current||!live||current.status==='disabled'||current.status==='archived'||current.archivedAt!=null||current.mustChangePassword===true)return false;
 if(current.status!=null&&current.status!=='active')return false;
 if(current.role!==requestUser.role||current.passwordHash!==requestUser.passwordHash)return false;
 if(current.username!==requestUser.username)return false;
 if(role&&current.role!==role)return false;
 return !permission||hasPermission(current,permission);
}
export const digest=(value)=>createHash('sha256').update(value).digest('hex');
export const token=()=>randomBytes(32).toString('hex');
export const ROLE_PERMISSIONS={
 admin:['*'],
 manager:['project.write','building.write','unit.write','client.write','staff.write','lease.write','fee.write','payment.write','deposit.write','deposit.approve','report.read','audit.read','settings.write','reminder.write','reminder.refresh'],
 accountant:['payment.write','deposit.write','deposit.execute','fee.read','report.read','reminder.write','reminder.refresh'],
 staff:['lease.read','unit.read','client.read','reminder.write'],
 viewer:['lease.read','unit.read']
};
export const hasPermission=(user,permission)=>!!user&&(ROLE_PERMISSIONS[user.role]||[]).some(p=>p==='*'||p===permission);
