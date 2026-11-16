import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
test('V2.65 viewer can filter and bookmark personal favorite apartments',()=>{
 const app=read('App.jsx'),dossier=read('components/PropertyDossier.jsx');
 assert.match(app,/favoritesOnly/);
 assert.match(app,/Đang xem căn đã lưu/);
 assert.match(app,/\(auth\?\.favoriteUnitIds\|\|\[\]\)\.some/);
 assert.match(app,/\/me\/favorites\//);
 assert.match(dossier,/onToggleFavorite/);
 assert.match(dossier,/Lưu căn quan tâm/);
 assert.match(dossier,/aria-pressed=\{isFavorite\}/);
});
test('V2.65 registration does not require a second login or admin approval',()=>{
 const portal=read('components/AuthPortal.jsx'),app=read('App.jsx');
 assert.match(portal,/await onRegistered\?\.\(response\)/);
 assert.match(app,/setCsrf\(response\.csrf\);setAuth\(response\.user\)/);
 assert.doesNotMatch(app,/\/auth\/users\/'\+u\.id\+'\/approve'/);
});

test('V2.65 profile name is writable by the account itself without privileges',()=>{
 const app=read('App.jsx');
 assert.match(app,/api\('\/auth\/profile'/);
 assert.match(app,/Tên hiển thị/);
});
