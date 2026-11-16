import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canNavigate} from '../src/lib/quick-find.js';
import {lockedPersonalFeatures,navigationDisplayLabel} from '../src/lib/navigation-shell.js';

const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const browser=readFileSync(new URL('../../scripts/qa-react-browser.mjs',import.meta.url),'utf8');
const sections=['dashboard','units','projects','leases','payments','fees','deposits','reminders','clients','staff','reports','quality','audit','archives','imports','settings'];
const expected={
 admin:sections,
 manager:sections,
 accountant:['dashboard','units','projects','payments','fees','deposits','reminders','reports'],
 staff:['dashboard','units','projects','leases','payments','reminders','clients'],
 viewer:['dashboard','units','projects']
};
for(const [role,menu] of Object.entries(expected)){
 test(`V2.73: ${role} only sees approved business destinations`,()=>{
  const user={role,ownedUnitCount:0};
  assert.deepEqual(sections.filter(key=>canNavigate(user,key)),menu);
  assert.equal(canNavigate(user,'profile'),true,'Every user retains personal account controls');
  assert.equal(canNavigate(user,'owned-assets'),false);
 });
}
test('V2.73: only unverified viewer sees a disabled ownership preview, never internal management locks',()=>{
 assert.deepEqual(lockedPersonalFeatures({role:'viewer',ownedUnitCount:0}).map(x=>x.key),['owned-assets']);
 assert.deepEqual(lockedPersonalFeatures({role:'viewer',ownedUnitCount:2}),[]);
 for(const role of ['admin','manager','accountant','staff'])assert.deepEqual(lockedPersonalFeatures({role,ownedUnitCount:0}),[]);
});
test('V2.73: logout hides account workspace before the first network await and disables a premature new login',()=>{
 const logout=app.slice(app.indexOf(' const logout=async()=>{'),app.indexOf(' const can=(permission)'));
 const network=logout.indexOf("await api('/auth/logout'");
 assert.ok(network>0);
 for(const statement of ['sessionBoundary.invalidate()','stateBoundary.invalidate()','ownedBoundary.invalidate()','setAuth(null)','setData(null)','setOwnedUnits([])','setOwnerRequests([])','setShowPrivateSearch(false)','setMobileOpen(false)','setArchives([])','setProfileName(\'\')','setLoadingAuth(true)']){
  const index=logout.indexOf(statement);assert.ok(index>=0&&index<network,`${statement} must execute before waiting for logout HTTP`);
 }
 assert.ok(logout.indexOf("setCsrf('')")>network,'CSRF must remain available to send the logout request');
 assert.ok(logout.indexOf('setLoadingAuth(false)')>network,'Login may resume only after logout settles');
});
test('V2.73: changing account clears old search filters, selected bulk records and overlays',()=>{
 const login=app.slice(app.indexOf(' const login=async('),app.indexOf(' const registered=async('));
 const registered=app.slice(app.indexOf(' const registered=async('),app.indexOf(' const toggleFavorite='));
 for(const source of [login,registered])for(const clear of [
  'setShowPrivateSearch(false)','setMobileOpen(false)','setBulkSelected([])','setBulkOpen(false)',
  'setFavoritesOnly(false)','setSearch(\'\')','setClientSearch(\'\')','setProjectFilter(\'\')',
  'setStaffFilter(\'\')','setArchives([])','setProfileName(\'\')','setToast(null)'
 ])assert.ok(source.includes(clear),`${clear} missing in account transition`);
});
test('V2.73: live-browser acceptance checks five roles, two viewport widths and delayed-logout privacy',()=>{
 for(const role of Object.keys(expected))assert.match(browser,new RegExp(`\\b${role}:\\[`));
 assert.match(browser,/async function auditRoleWorkspace\(cdp,role\)/);
 assert.match(browser,/for\(const \[pageIndex,label\] of ROLE_NAVIGATION\[role\]\.entries\(\)\)/);
 assert.match(browser,/await cdp.viewport\(390\)/);
 assert.match(browser,/await clickNavigationLabel\(cdp,'Danh mục căn hộ'\)/);
 assert.match(browser,/async function auditImmediateLogout\(cdp,unitCode\)/);
 assert.match(browser,/const armed=await cdp\.eval/);
 assert.match(browser,/await auditRoleWorkspace\(cdp,role\)/);
 assert.match(browser,/await auditImmediateLogout\(cdp,code\)/);
 assert.match(browser,/status,200,'Test must hold logout before server session revocation'/);
 assert.match(browser,/status,401,'Server did not revoke the session after UI quarantine'/);
});

test('V2.73: managers see operational settings, not a misleading role-grant screen',()=>{
 assert.equal(navigationDisplayLabel({role:'manager'},'settings','Cài đặt & phân quyền'),'Thiết lập vận hành');
 assert.equal(navigationDisplayLabel({role:'admin'},'settings','Cài đặt & phân quyền'),'Cài đặt & phân quyền');
 assert.equal(navigationDisplayLabel({role:'manager'},'units','Danh mục căn hộ'),'Danh mục căn hộ');
 assert.match(app,/auth\.role==='admin'&&<section className="aurel-admin-access"/);
 assert.match(browser,/manager:\[[^\n]*'Thiết lập vận hành'/);
});
