import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {requestWorkspaceAccount,updateFavoriteUnits} from '../src/account-onboarding.js';
import {hasPermission} from '../src/security.js';
const db=()=>({users:[],units:[{id:7,code:'A-07',status:'vacant'},{id:'07',code:'A-007',status:'vacant'},{id:8,code:'A-08',status:'archived'}],sessions:[],audit:[]});
const register=(state,handle)=>{const result=requestWorkspaceAccount(state,{name:'Người dùng '+handle,username:handle,password:'StrongPass2026!'});return result.userId};
test('V2.65 viewer saves and removes apartments only in their own personal list',()=>{
 const data=db(),u1=register(data,'account.one'),u2=register(data,'account.two');
 assert.deepEqual(updateFavoriteUnits(data,u1,7,true),{favoriteUnitIds:[7]});
 assert.deepEqual(updateFavoriteUnits(data,u1,'7',true),{favoriteUnitIds:[7]});
 assert.deepEqual(updateFavoriteUnits(data,u2,'07',true),{favoriteUnitIds:['07']});
 assert.deepEqual(updateFavoriteUnits(data,u1,'7',false),{favoriteUnitIds:[]});
 assert.deepEqual(data.users.find(u=>u.id===u2).favoriteUnitIds,['07']);
 assert.equal(hasPermission(data.users[0],'unit.read'),true);
 assert.equal(hasPermission(data.users[0],'unit.write'),false);
 assert.equal(hasPermission(data.users[0],'payment.write'),false);
});
test('V2.65 private list rejects missing and archived properties, never modifies property records',()=>{
 const data=db(),id=register(data,'safe.viewer'),before=structuredClone(data.units);
 assert.throws(()=>updateFavoriteUnits(data,id,'missing',true),/Không tìm thấy căn hộ/);
 assert.throws(()=>updateFavoriteUnits(data,id,8,true),/Không tìm thấy căn hộ/);
 assert.deepEqual(data.units,before);
});
test('V2.65 the browser API implements account-specific bookmarks behind authentication and CSRF',()=>{
 const src=readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
 assert.ok(src.indexOf("app.use('/api',authenticate)")<src.indexOf("app.put('/api/me/favorites/:unitId'"));
 assert.match(src,/app\.delete\('\/api\/me\/favorites\/:unitId'/);
 assert.match(src,/makeSession\(db,user\)/);
 assert.match(src,/SESSION_MS=14\*24\*60\*60\*1000/);
 assert.match(src,/req\.headers\['x-csrf-token'\]!==sess\.csrf/);
});
