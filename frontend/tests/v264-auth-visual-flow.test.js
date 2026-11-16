import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
test('V2.65 the register button enters the app directly as viewer',()=>{
 const auth=src('components/AuthPortal.jsx'),app=src('App.jsx');
 assert.match(auth,/onClick=\{\(\)=>changeMode\('register'\)\}/);
 assert.match(auth,/name:name\.trim\(\),password:newPassword/);
 assert.match(auth,/await onRegistered\?\.\(response\)/);
 assert.match(auth,/Tạo tài khoản & vào AUREL/);
 assert.match(auth,/newPassword!==confirmPassword/);
 assert.match(app,/onRegistered=\{registered\}/);
 assert.doesNotMatch(auth,/Đã gửi đăng ký/);
});
test('V2.65 admin manages roles rather than login approval',()=>{
 const panel=src('components/AccountAccessPanel.jsx'),app=src('App.jsx');
 assert.match(panel,/onEdit\(u\)/);
 assert.match(panel,/Chỉnh quyền/);
 assert.doesNotMatch(panel,/Duyệt truy cập|onApprove/);
 assert.doesNotMatch(app,/\/auth\/users\/'\+u\.id\+'\/approve'/);
 assert.doesNotMatch(panel,/onCreate/);
});
test('V2.64 uses system fonts with Vietnamese diacritic support and seamless approved logo',()=>{
 const css=src('atelier-v233.css'),brand=src('components/BrandWordmark.jsx');
 assert.match(css,/V2\.64 — Auth typography/);
 assert.match(css,/"Segoe UI","Be Vietnam Pro"/);
 assert.match(css,/\.aurel-auth-brand--image \.aurel-brand-wordmark\{mix-blend-mode:multiply;\}/);
 assert.match(css,/\.aurel-auth-brand\.aurel-auth-brand--image\{[\s\S]*?border:0;/);
 assert.match(brand,/aurel-selected-wordmark\.png/);
});
