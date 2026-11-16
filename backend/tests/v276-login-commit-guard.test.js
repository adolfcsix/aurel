import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canCommitLogin,hashPassword} from '../src/security.js';
import {disposablePgTarget} from '../../scripts/pg-test-config.mjs';

const current=()=>({id:'viewer-7',username:'owner.qa',passwordHash:hashPassword('private-QA-2026'),role:'viewer',status:'active',mustChangePassword:false});
const pgEnv=(url)=>({AUREL_STORAGE:'postgres',AUREL_PG_TEST_WRITE_ACK:'yes',AUREL_PG_TEST_DATABASE_URL:url});

test('V2.76: active viewer login remains valid when credential snapshot is unchanged',()=>{
 const user=current();assert.equal(canCommitLogin(user,structuredClone(user),'owner.qa'),true);
});
test('V2.76: a reset password between credential read and session write denies login',()=>{
 const before=current(),after={...before,passwordHash:hashPassword('new-credential-QA-2026')};
 assert.equal(canCommitLogin(before,after,'owner.qa'),false);
});
test('V2.76: disabling or archiving an account before session write denies login',()=>{
 const before=current();
 for(const after of [{...before,status:'disabled'},{...before,status:'archived'},{...before,archivedAt:'2026-11-12T00:00:00Z'},null])
  assert.equal(canCommitLogin(before,after,'owner.qa'),false);
});
test('V2.76: admin changing username or account identity denies stale login',()=>{
 const before=current();
 assert.equal(canCommitLogin(before,{...before,username:'renamed.owner'},'owner.qa'),false);
 assert.equal(canCommitLogin(before,{...before,id:'another-user'},'owner.qa'),false);
});
test('V2.76: activation-required employee cannot obtain session from stale password',()=>{
 const before=current();
 assert.equal(canCommitLogin(before,{...before,mustChangePassword:true},'owner.qa'),false);
 assert.equal(canCommitLogin(before,{...before,status:'pending',role:'manager'},'owner.qa'),false);
});
test('V2.76: legacy pending viewer can activate, but disabled viewer cannot',()=>{
 const before={...current(),status:'pending'};
 assert.equal(canCommitLogin(before,structuredClone(before),'owner.qa'),true);
 assert.equal(canCommitLogin(before,{...before,status:'disabled'},'owner.qa'),false);
});
test('V2.76: invalid or incomplete persisted records cannot pass session write guard',()=>{
 const before=current();
 for(const latest of [{...before,passwordHash:null},{...before,username:null},{...before,status:'pending',role:'admin'},{...before,archivedAt:'2026-01-01'}])
  assert.equal(canCommitLogin(before,latest,'owner.qa'),false);
});
test('V2.76: URL safety gate accepts local PostgreSQL test targets with explicit acknowledgement',()=>{
 for(const hostname of ['localhost','127.0.0.1','[::1]']){
  const target=disposablePgTarget(pgEnv(`postgresql://qa:qa-secret@${hostname}:5436/aurel_workspace_test`));
  assert.equal(target.name,'aurel_workspace_test');
 }
});
test('V2.76: URL safety gate refuses remote hosts even with _test suffix and ACK',()=>{
 for(const host of ['production.example','172.20.0.2','127.0.0.1.evil.example','example.org'])
  assert.throws(()=>disposablePgTarget(pgEnv(`postgresql://qa:secret@${host}/aurel_workspace_test`)),/loopback|localhost/);
});
test('V2.76: URL safety gate rejects libpq options/fragment tampering',()=>{
 for(const extra of ['?options=-csearch_path%3Dpublic','#fragment','?sslmode=require'])
  assert.throws(()=>disposablePgTarget(pgEnv('postgresql://qa:secret@localhost/aurel_workspace_test'+extra)),/options|fragments/);
});
test('V2.76: server session creation must recheck account inside updateDb before creating cookie',()=>{
 const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 const section=source.slice(source.indexOf("app.post('/api/auth/login'"),source.indexOf("app.post('/api/auth/register'"));
 const update=section.indexOf('const session=await updateDb');
 const validate=section.indexOf('canCommitLogin(user,current,username)');
 const issue=section.indexOf('issueCookie(res,session.session.value)');
 assert.ok(update>=0 && validate>update && issue>validate,'Must validate inside transaction before cookie issuance');
 assert.ok(section.indexOf('loginThrottle.clear(loginKey)')>validate,'Do not clear throttle until session committed');
});
