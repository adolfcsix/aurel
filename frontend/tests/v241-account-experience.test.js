import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {accountState,accountSummary,accountVisibleRows,accountMayReset,accountDisplayName,accountInitial,accountSearchText} from '../src/lib/account-presentation.js';
const src=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');

test('v241 account states follow API precedence, disabled supersedes activation',()=>{
 assert.equal(accountState({status:'disabled',accessStatus:'pending_activation'}),'disabled');
 assert.equal(accountState({status:'active',accessStatus:'disabled'}),'disabled');
 assert.equal(accountState({status:'active',mustChangePassword:true}),'pending_activation');
 assert.equal(accountState({status:'active',accessStatus:'active'}),'active');
});
test('v241 summaries and filters share exactly the same state logic',()=>{
 const users=[
  {id:1,name:'Anh Minh',accessStatus:'pending_activation'},
  {id:2,name:'Hà Linh',status:'disabled',accessStatus:'pending_activation'},
  {id:3,name:'Trần Bình',accessStatus:'disabled'},
  {id:4,name:'Lê Hạnh',status:'active',accessStatus:'active'}
 ];
 assert.deepEqual(accountSummary(users),{total:4,pending:1,locked:2});
 assert.equal(accountVisibleRows(users,{filter:'disabled'}).length,2);
 assert.equal(accountVisibleRows(users,{filter:'pending_activation'}).length,1);
 assert.equal(accountVisibleRows(users,{filter:'active'}).length,1);
});
test('v241 search handles Vietnamese diacritics, names, account IDs and role labels',()=>{
 const users=[{id:1,name:'Nguyễn Thị Hà',username:'ntha',role:'manager'},{id:2,name:'Lê Minh',username:'leminh',role:'accountant'}];
 assert.equal(accountSearchText('  QUẢN LÝ   '),'quan ly');
 assert.equal(accountVisibleRows(users,{search:'nguyen thi ha'}).length,1);
 assert.equal(accountVisibleRows(users,{search:'NTHA'}).length,1);
 assert.equal(accountVisibleRows(users,{search:'Kế Toán',roleNames:{accountant:'Kế toán'}})[0]?.id,2);
 assert.equal(accountVisibleRows(users,{filter:'disabled'}).length,0);
});
test('v241 a current user cannot be offered reset even if ID representations differ',()=>{
 assert.equal(accountMayReset({id:7,status:'active'},'7'),false);
 assert.equal(accountMayReset({id:' 7 ',status:'active'},7),false);
 assert.equal(accountMayReset({id:8,status:'disabled'},7),false);
 assert.equal(accountMayReset({id:8,status:'active'},7),true);
 assert.equal(accountMayReset({id:null,status:'active'},7),false);
 assert.equal(accountMayReset({id:9,status:'pending'},7),false);
});
test('v241 account identity is consistent with safe fallback',()=>{
 assert.equal(accountDisplayName({name:'  ',username:'hoa.tran'}),'hoa.tran');
 assert.equal(accountInitial({name:'  ',username:'hoa.tran'}),'H');
 assert.equal(accountDisplayName({name:' Ngọc Anh '}),'Ngọc Anh');
});
test('v241 privileged controls are distinguishable by their real account subject',()=>{
 const source=src('components/AccountAccessPanel.jsx');
 assert.match(source,/accountStateLabels\[status\]/);
 assert.match(source,/accountSummary\(users\)/);
 assert.match(source,/accountMayReset\(u,currentUserId\)/);
 assert.match(source,/aria-label=\{'Chỉnh quyền tài khoản '\+name\}/);
 assert.match(source,/aria-label=\{'Đặt lại mật khẩu tài khoản '\+name\}/);
 assert.doesNotMatch(source,/Thử từ khóa hoặc trạng thái khác/);
});
test('v241 login mode changes clear confidential fields and maintain clear copy',()=>{
 const source=src('components/AuthPortal.jsx');
 assert.match(source,/setTempPassword\(''\);setNewPassword\(''\);setConfirmPassword\(''\)/);
 assert.match(source,/setShowPassword\(false\);setShowNewPassword\(false\)/);
 assert.match(source,/if\(!username\.trim\(\)\)/);
 assert.match(source,/activation\?'Kích hoạt tài khoản'/);
 assert.match(source,/registration\?'Tạo tài khoản'/);
 assert.doesNotMatch(source,/Thử phím|Nhấn Escape|Cách thử/);
});
test('v241 polished account buttons reuse existing final CSS and 14px silhouette',()=>{
 const css=src('atelier-v233.css');
 assert.match(css,/V2\.41 — Account craftsmanship/);
 assert.match(css,/border-radius:var\(--aurel-action-radius,14px\)/);
 assert.match(css,/\.aurel-access-manager \.aurel-access-actions button \{[^}]*min-height:44px/s);
 assert.match(css,/@media\(max-width:800px\)/);
 assert.match(css,/@media\(forced-colors:active\)/);
 assert.doesNotMatch(src('main.jsx'),/atelier-v241\.css/);
});
