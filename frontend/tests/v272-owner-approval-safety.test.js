import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const src=file=>readFileSync(new URL(file,import.meta.url),'utf8');
const inbox=src('../src/components/OwnerChangeRequests.jsx');
const dialog=src('../src/components/ConfirmDialog.jsx');
const app=src('../src/App.jsx');
const browser=src('../../scripts/qa-react-browser.mjs');
const pkg=JSON.parse(src('../../package.json'));

test('V2.72: owner manager approve and reject buttons only open review, not mutate immediately',()=>{
 assert.match(inbox,/onClick=\{\(\)=>setReview\(\{request,decision:'approve'\}\)\}/);
 assert.match(inbox,/onClick=\{\(\)=>setReview\(\{request,decision:'reject'\}\)\}/);
 assert.doesNotMatch(inbox,/onClick=\{\(\)=>decide\(request,/);
 assert.match(inbox,/onConfirm=\{\(\)=>decide\(review\.request,review\.decision\)\}/);
 assert.match(inbox,/if\(actionBusy\.current\|\|!canSubmit\)return/);
 assert.match(inbox,/actionBusy\.current=true;setBusy\(request\.id\)/);
});

test('V2.72: explicit review gives old/new property values and decision-specific warning',()=>{
 for(const field of ["'Căn hộ'","'Trường thay đổi'","'Giá trị hiện tại'","'Giá trị đề nghị'"])
  assert.ok(inbox.includes(field),'Missing confirmation fact: '+field);
 assert.match(inbox,/máy chủ kiểm tra lại quyền sở hữu và phiên bản hồ sơ/);
 assert.match(inbox,/hồ sơ căn hộ không thay đổi/);
 assert.match(inbox,/busy=\{!!busy\}/);
 assert.match(inbox,/finally\{actionBusy\.current=false/);
 assert.match(inbox,/if\(accepted\)setReview\(null\)/);
});

test('V2.72: existing accessible confirmation dialog is shared by main workspace and owner inbox',()=>{
 assert.match(app,/import ConfirmDialog from '\.\/components\/ConfirmDialog\.jsx'/);
 assert.match(inbox,/import ConfirmDialog from '\.\/ConfirmDialog\.jsx'/);
 assert.doesNotMatch(app,/function ConfirmDialog\(/);
 assert.match(dialog,/role="alertdialog" aria-modal="true"/);
 assert.match(dialog,/containModalTab\(e,dialogRef\.current/);
 assert.match(dialog,/onClose\(\)/);
 assert.match(dialog,/details\.facts\?\.length>0/);
});

test('V2.72: browser UAT must test manager cancel does not mutate then explicit approval',()=>{
 assert.match(browser,/Manager confirmation cancel is missing/);
 assert.match(browser,/Cancel unexpectedly processed owner request/);
 assert.match(browser,/Cancel must not edit property/);
 assert.match(browser,/Manager final approval confirmation missing/);
});

test('V2.72: Windows-ready npm evidence task now exists and uses isolated QA screenshot option',()=>{
 assert.equal(pkg.scripts['qa:browser:evidence'],'node scripts/qa-react-browser.mjs --evidence');
 assert.match(browser,/AUREL_QA_OUTPUT_DIR/);
 assert.match(browser,/aurel-json-/);
});

test('V2.72: browser gate detects missing runtime before starting Chrome, driver stays independently available',()=>{
 assert.match(browser,/if\(!driverCheck\)\{const missing=coreBrowserDependencies\(\)/);
 assert.ok(browser.indexOf('if(!driverCheck){const missing=coreBrowserDependencies()')<browser.indexOf('cdp=await connectChrome()'));
 assert.match(browser,/if\(driverCheck\)\{/);
 const syntax=spawnSync(process.execPath,['--check',new URL('../../scripts/qa-react-browser.mjs',import.meta.url).pathname],{encoding:'utf8'});
 assert.equal(syntax.status,0,syntax.stderr);
});
