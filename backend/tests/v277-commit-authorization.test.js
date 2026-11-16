import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canCommitSessionMutation,hashPassword} from '../src/security.js';

const fresh=()=>{
 const actor={id:'admin-qa',username:'admin-qa',name:'QA Administrator',role:'admin',status:'active',passwordHash:hashPassword('QA-Only-Current-2026!'),mustChangePassword:false};
 const session={id:'digest-of-QA-only-cookie',userId:actor.id,expiresAt:Date.now()+60_000,csrf:'qa-csrf'};
 return {actor,session,db:{users:[structuredClone(actor)],sessions:[structuredClone(session)]}};
};

test('V2.77: unchanged admin session can commit an authorized account mutation',()=>{
 const {db,actor,session}=fresh();
 assert.equal(canCommitSessionMutation(db,actor,session,{role:'admin'}),true);
});
test('V2.77: demotion between authorization and transaction blocks privilege mutation',()=>{
 const {db,actor,session}=fresh();db.users[0].role='viewer';
 assert.equal(canCommitSessionMutation(db,actor,session,{role:'admin'}),false);
});
test('V2.77: account lock or archival before transaction blocks mutation',()=>{
 for(const change of [{status:'disabled'},{status:'archived'},{archivedAt:'2026-11-13T00:00:00Z'},{mustChangePassword:true}]){
  const {db,actor,session}=fresh();Object.assign(db.users[0],change);
  assert.equal(canCommitSessionMutation(db,actor,session,{role:'admin'}),false,JSON.stringify(change));
 }
});
test('V2.77: admin password reset blocks in-flight password change',()=>{
 const {db,actor,session}=fresh();db.users[0].passwordHash=hashPassword('QA-Only-Reset-2026!');
 assert.equal(canCommitSessionMutation(db,actor,session),false);
});
test('V2.77: session revocation or reassignment blocks stale writes',()=>{
 const a=fresh();a.db.sessions=[];
 assert.equal(canCommitSessionMutation(a.db,a.actor,a.session,{role:'admin'}),false);
 const b=fresh();b.db.sessions[0].userId='another-user';
 assert.equal(canCommitSessionMutation(b.db,b.actor,b.session,{role:'admin'}),false);
 const c=fresh();c.db.sessions[0].id='rotated-session';
 assert.equal(canCommitSessionMutation(c.db,c.actor,c.session,{role:'admin'}),false);
});
test('V2.77: expired sessions cannot authorize committed changes',()=>{
 const {db,actor,session}=fresh();db.sessions[0].expiresAt=Date.now()-1;
 assert.equal(canCommitSessionMutation(db,actor,session,{role:'admin'}),false);
});
test('V2.77: renamed or replaced account cannot use old request snapshot',()=>{
 const a=fresh();a.db.users[0].username='renamed-admin';
 assert.equal(canCommitSessionMutation(a.db,a.actor,a.session),false);
 const b=fresh();b.db.users[0].id='other-admin';
 assert.equal(canCommitSessionMutation(b.db,b.actor,b.session),false);
});
test('V2.77: manager may approve property changes but viewer may not',()=>{
 const {db,actor,session}=fresh();db.users[0].role='manager';actor.role='manager';
 assert.equal(canCommitSessionMutation(db,actor,session,{permission:'unit.write'}),true);
 db.users[0].role='viewer';actor.role='viewer';
 assert.equal(canCommitSessionMutation(db,actor,session,{permission:'unit.write'}),false);
});
test('V2.77: snapshot cannot invent admin privileges after current role upgrade',()=>{
 const {db,actor,session}=fresh();actor.role='viewer';
 assert.equal(canCommitSessionMutation(db,actor,session,{role:'admin'}),false);
});
test('V2.77: missing users, sessions, and malformed status fail closed',()=>{
 const {db,actor,session}=fresh();
 assert.equal(canCommitSessionMutation(null,actor,session),false);
 assert.equal(canCommitSessionMutation({users:[],sessions:db.sessions},actor,session),false);
 assert.equal(canCommitSessionMutation({users:db.users,sessions:[]},actor,session),false);
 db.users[0].status='pending';assert.equal(canCommitSessionMutation(db,actor,session),false);
});
test('V2.77: owner verification, account grants and password changes recheck inside updateDb',()=>{
 const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 const segments=[
  ["app.put('/api/auth/users/:id/owner-clients/:clientId'","app.delete('/api/auth/users/:id/owner-clients/:clientId'",'requireFreshAdmin(db,req)'],
  ["app.delete('/api/auth/users/:id/owner-clients/:clientId'","app.get('/api/me/owned-units'",'requireFreshAdmin(db,req)'],
  ["app.post('/api/auth/users'","app.post('/api/auth/users/:id/reset-password'",'requireFreshAdmin(db,req)'],
  ["app.post('/api/auth/users/:id/reset-password'","app.patch('/api/auth/users/:id'",'requireFreshAdmin(db,req)'],
  ["app.patch('/api/auth/users/:id'","app.use((err",'requireFreshAdmin(db,req)'],
  ["app.post('/api/auth/change-password'","app.get('/api/state'",'canCommitSessionMutation(db,req.user,req.session)'],
  ["app.post('/api/owner-change-requests/:id/:decision'","app.patch('/api/auth/profile'",'canCommitSessionMutation(db,req.user,req.session'],
 ];
 for(const [start,end,guard] of segments){
  const pos=source.indexOf(start),to=source.indexOf(end,pos+1);
  assert.ok(pos>=0&&to>pos,`Expected API route segment missing: ${start}`);
  const section=source.slice(pos,to);
  assert.ok(section.indexOf(guard)>section.indexOf('updateDb('),`Guard must be inside transaction: ${start}`);
 }
});

test('V2.77: password changes reuse the enrollment policy, not an inconsistent weaker rule',()=>{
 const src=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 const begin=src.indexOf("app.post('/api/auth/change-password'");
 const end=src.indexOf("app.get('/api/state'",begin);
 const section=src.slice(begin,end);
 assert.ok(section.includes('validateNewPassword(newPassword)'), 'Password change must match new-account and reset policy');
 assert.ok(section.includes('verifyPassword(newPassword,req.user.passwordHash)'), 'Cannot reuse current password');
 assert.ok(section.includes('canCommitSessionMutation(db,req.user,req.session)'), 'Password must be checked again at commit');
});
