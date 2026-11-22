import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const portal=src('../src/components/AuthPortal.jsx');
const access=src('../src/components/AccountAccessPanel.jsx');
const app=src('../src/App.jsx');
const css=src('../src/atelier-v215.css');
test('auth portal offers personal-password registration and legacy activation',()=>{
 assert.match(portal,/Đăng ký tài khoản/);
 assert.match(portal,/\/auth\/register/);
 assert.match(portal,/Kích hoạt tài khoản/);
 assert.match(portal,/\/auth\/activate/);
 assert.match(portal,/await onRegistered\?\.\(response\)/);
});
test('activation requires matching new passwords and visibly handles errors',()=>{assert.match(portal,/newPassword!==confirmPassword/);assert.match(portal,/role="alert"/);assert.match(portal,/autoComplete="new-password"/);assert.match(portal,/aria-label=\{showPassword/)});
test('access manager has search, status filter and explicit reset action',()=>{
 assert.match(access,/Tìm theo tên, tài khoản hoặc vai trò/);
 assert.match(access,/Chờ kích hoạt cũ/);assert.doesNotMatch(access,/Duyệt truy cập/);
 assert.match(access,/onReset\(u\)/);
 assert.match(access,/currentUserId/);
});
test('admin accesses managed account page and password reset endpoint',()=>{
 assert.match(app,/AccountAccessPanel users=\{data\.users\}/);
 assert.match(app,/kind==='account-reset'/);
 assert.match(app,/\/reset-password/);
 assert.match(app,/if\(!auth\)return <AuthPortal/);
 assert.doesNotMatch(app,/function Login\(/);
});
test('design supports responsive layout and motion reduction',()=>{assert.match(css,/@media\(max-width:620px\)/);assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/\.aurel-auth-input:focus-within/);assert.match(css,/\.aurel-access-user/)});

test('account menu provides account details, change password and sign-out safely',()=>{const menu=src('../src/components/AccountMenu.jsx');assert.match(menu,/onPassword/);assert.match(menu,/onLogout/);assert.match(menu,/role="menu"/);assert.match(menu,/aria-expanded=\{open\}/);assert.match(app,/<AccountMenu user=\{auth\}/)});
