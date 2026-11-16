import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {requestWorkspaceAccount,accountDisplayStatus} from '../src/account-onboarding.js';
import {verifyPassword,hasPermission} from '../src/security.js';

const makeDb=()=>({users:[],sessions:[],audit:[]});
const applicant={username:'Lan.Nguyen',name:'Nguyễn Thị Lan',password:'SafePassword2026!'};
test('V2.65 direct registration creates an active viewer and a hashed personal password',()=>{
 const db=makeDb(),result=requestWorkspaceAccount(db,applicant);
 assert.equal(result.userId,db.users[0].id);
 const user=db.users[0];
 assert.equal(user.username,'lan.nguyen');assert.equal(user.name,applicant.name);
 assert.equal(user.status,'active');assert.equal(user.role,'viewer');assert.equal(user.staffId,null);
 assert.equal(accountDisplayStatus(user),'active');
 assert.deepEqual(user.favoriteUnitIds,[]);
 assert.ok(verifyPassword(applicant.password,user.passwordHash));
 assert.equal(hasPermission(user,'unit.read'),true);
 for(const forbidden of ['unit.write','payment.write','deposit.write','client.write','settings.write','audit.read'])assert.equal(hasPermission(user,forbidden),false);
 assert.ok(!JSON.stringify(result).includes('passwordHash'));
 assert.ok(!JSON.stringify(db.audit).includes(applicant.password));
});
test('V2.65 ignores attempted admin / staff / accountant self-elevation',()=>{
 for(const injected of [{role:'admin'},{role:'manager'},{role:'accountant'},{status:'active'},{staffId:'any'},{approvedBy:'admin'},{passwordHash:'forged'},{favoriteUnitIds:['admin-only-unit']},{extra:{role:'admin'}}]){
  const db=makeDb();assert.throws(()=>requestWorkspaceAccount(db,{...applicant,...injected}));assert.equal(db.users.length,0);
 }
});
test('V2.65 registration rejects weak or duplicate credentials and preserves archived handles',()=>{
 const db=makeDb();
 for(const changes of [{password:'short'},{password:'lettersonlynowithdigits'},{name:' '},{username:'ab'},{username:' Tên Có Dấu '},{username:{a:'b'}}])assert.throws(()=>requestWorkspaceAccount(db,{...applicant,...changes}));
 requestWorkspaceAccount(db,applicant);
 assert.throws(()=>requestWorkspaceAccount(db,{...applicant,username:'LAN.NGUYEN'}),/đã được sử dụng/);
 db.users[0].status='archived';assert.throws(()=>requestWorkspaceAccount(db,applicant),/đã được sử dụng/);
});
test('V2.65 HTTP registration directly issues a session; no admin approval endpoint',()=>{
 const source=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 assert.match(source,/app\.post\('\/api\/auth\/register'/);
 assert.match(source,/const result=await updateDb\(db=>\{const \{userId\}=requestWorkspaceAccount/);
 assert.match(source,/issueCookie\(res,result\.session\.value\);res\.status\(201\)\.json\(\{user:result\.user,csrf:result\.session\.csrf\}\)/);
 assert.doesNotMatch(source,/app\.post\('\/api\/auth\/users\/:id\/approve'/);
 assert.ok(source.indexOf("app.post('/api/auth/register'")<source.indexOf("app.use('/api',authenticate)"));
 assert.match(source,/registrationThrottle\.assertAllowed\(key\)/);
});
