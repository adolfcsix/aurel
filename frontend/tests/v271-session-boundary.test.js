import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSessionBoundary} from '../src/lib/session-boundary.js';

const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const delay=()=>new Promise(resolve=>setImmediate(resolve));

test('V2.71: session generation rejects a late response from the previous account',async()=>{
 const boundary=createSessionBoundary();
 const oldToken=boundary.capture();
 let release;
 const late=new Promise(resolve=>{release=resolve});
 let displayed='new account';
 const pending=late.then(value=>{if(boundary.matches(oldToken))displayed=value});
 boundary.invalidate(); // logout + login or registration
 release('private data from old account');
 await pending;
 assert.equal(displayed,'new account');
 assert.equal(boundary.matches(oldToken),false);
});

test('V2.71: only the latest refresh of the same account may commit',async()=>{
 const boundary=createSessionBoundary();
 const first=boundary.invalidate();
 const latest=boundary.invalidate();
 assert.equal(boundary.matches(first),false);
 assert.equal(boundary.matches(latest),true);
 await delay();
 assert.equal(boundary.matches(latest),true);
});

test('V2.71: independently fenced resources do not invalidate one another',()=>{
 const account=createSessionBoundary(),state=createSessionBoundary(),owned=createSessionBoundary();
 const identity=account.capture(),stateRead=state.invalidate(),ownedRead=owned.invalidate();
 state.invalidate();
 assert.equal(state.matches(stateRead),false);
 assert.equal(owned.matches(ownedRead),true);
 account.invalidate();
 assert.equal(account.matches(identity),false);
 assert.equal(owned.matches(ownedRead),true,'owner read must be checked against account fence as well');
});

test('V2.71: expired session read cannot repopulate workspace after logout',()=>{
 assert.match(app,/const identity=sessionBoundary\.capture\(\),request=stateBoundary\.invalidate\(\)/);
 assert.match(app,/if\(!sessionBoundary\.matches\(identity\)\|\|!stateBoundary\.matches\(request\)\)return false/);
 assert.match(app,/if\(e\.status===401\)\{sessionBoundary\.invalidate\(\);ownedBoundary\.invalidate\(\);qualityBoundary\.invalidate\(\);archiveBoundary\.invalidate\(\);actionFence\.invalidate\(\);ownerNoteFence\.invalidate\(\);ownerNoteBusy\.current=false;ownerNoteDirty\.current\.clear\(\);setSavingOwnerNoteId\(null\);actionInFlight\.current=false;setBusy\(false\);setCsrf\(''\)/);
 assert.match(app,/const logout=async\(\)=>\{[\s\S]*?sessionBoundary\.invalidate\(\);stateBoundary\.invalidate\(\);ownedBoundary\.invalidate\(\)/);
});

test('V2.71: private owner notes and proposals share an identity fence',()=>{
 assert.match(app,/const identity=sessionBoundary\.capture\(\),request=ownedBoundary\.invalidate\(\)/);
 assert.match(app,/if\(!sessionBoundary\.matches\(identity\)\|\|!ownedBoundary\.matches\(request\)\)return/);
 assert.match(app,/setOwnedUnits\(rows\);setOwnerRequests\(requests\);/);
 assert.match(app,/finally\{if\(sessionBoundary\.matches\(identity\)&&ownedBoundary\.matches\(request\)\)setOwnedLoading\(false\)\}/);
});

test('V2.71: login and registration clear former account data before publishing new identity',()=>{
 const login=app.slice(app.indexOf(' const login=async('),app.indexOf(' const registered=async('));
 const registered=app.slice(app.indexOf(' const registered=async('),app.indexOf(' const toggleFavorite='));
 for(const chunk of [login,registered]){
  assert.match(chunk,/sessionBoundary\.invalidate\(\)/);
  assert.ok(chunk.indexOf('setData(null)')>=0&&chunk.indexOf('setData(null)')<chunk.indexOf('setAuth('),'Old financial state must be cleared before new role is displayed');
  assert.match(chunk,/setOwnedUnits\(\[\]\);setOwnerRequests\(\[\]\);setOwnerDrafts\(\{\}\)/);
  assert.match(chunk,/setSelected\(null\);setDossier\(null\);setEdit\(null\)/);
  assert.match(chunk,/setPage\('dashboard'\)/);
 }
});

test('V2.71: uncertain logout clears the displayed private workspace and warns the user',()=>{
 const logout=app.slice(app.indexOf(' const logout=async('),app.indexOf(' const can=(permission)'));
 assert.match(logout,/logoutWarning='Chưa thể xác nhận đăng xuất trên máy chủ/);
 assert.ok(logout.indexOf('setAuth(null)')>=0&&logout.indexOf('setData(null)')>logout.indexOf('setAuth(null)'));
 assert.ok(logout.indexOf('setData(null)')<logout.indexOf("await api('/auth/logout'"),'User data must disappear before awaiting server logout');
 assert.match(logout,/setOwnedUnits\(\[\]\);setOwnerRequests\(\[\]\);setOwnerDrafts\(\{\}\)/);
 assert.match(logout,/setAuthError\(logoutWarning\)/);
});

test('V2.71: Windows/Node 22 integration gate launches npm.cmd through a shell',()=>{
 const gate=readFileSync(new URL('../../scripts/qa-gate.mjs',import.meta.url),'utf8');
 assert.match(gate,/const cmd=process\.platform==='win32'\?'npm\.cmd':'npm'/);
 assert.match(gate,/spawn\(command,args,\{cwd:root,env:process\.env,stdio:'inherit',shell:process\.platform==='win32'\}\)/);
});

test('V2.71: browser acceptance saves optional isolated QA failure evidence, never production snapshots by default',()=>{
 const driver=readFileSync(new URL('../../scripts/qa-react-browser.mjs',import.meta.url),'utf8');
 const gitignore=readFileSync(new URL('../../.gitignore',import.meta.url),'utf8');
 assert.match(driver,/process\.argv\.includes\('--evidence'\)/);
 assert.match(driver,/workspace&&process\.env\.AUREL_QA_OUTPUT_DIR/);
 assert.match(driver,/screenshot\(cdp,'FAILURE_CONTEXT'\)/);
 assert.match(gitignore,/^qa-evidence\/$/m);
});
