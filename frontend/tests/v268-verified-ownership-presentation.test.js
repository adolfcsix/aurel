import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canNavigate} from '../src/lib/quick-find.js';
import {lockedPersonalFeatures} from '../src/lib/navigation-shell.js';
const source=f=>readFileSync(new URL('../src/'+f,import.meta.url),'utf8');
test('V2.68: ownership unlocks only personal route, never staff, accounting, role management',()=>{
 const verified={role:'viewer',ownedUnitCount:1};
 assert.equal(canNavigate(verified,'owned-assets'),true);
 assert.deepEqual(lockedPersonalFeatures(verified),[]);
 for(const page of ['leases','payments','deposits','settings','staff','quality','clients','reports','audit'])assert.equal(canNavigate(verified,page),false,page);
 const awaiting={role:'viewer',ownedUnitCount:0};assert.equal(canNavigate(awaiting,'owned-assets'),false);assert.equal(lockedPersonalFeatures(awaiting).length,1);
 assert.equal(canNavigate({role:'admin',ownedUnitCount:1},'owned-assets'),false);
});
test('V2.68: admin verification controls and owner page use separate authenticated APIs',()=>{
 const panel=source('components/AccountAccessPanel.jsx'),app=source('App.jsx');
 assert.match(panel,/Xác minh & liên kết/);
 assert.match(panel,/Thu hồi/);
 assert.match(app,/\/me\/owned-units/);
 assert.match(app,/\/auth\/users\/.*owner-clients/);
 assert.match(app,/Ghi chú cá nhân của bạn/);
 assert.match(app,/page==='owned-assets'&&canNavigate\(auth,'owned-assets'\)/);
 assert.doesNotMatch(app,/page==='owned-assets'&&can\('unit.write'\)/);
});
