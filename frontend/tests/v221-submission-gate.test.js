import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSubmissionGate,submissionLockedMessage} from '../src/lib/submission-gate.js';
const source=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8');

test('V2.21: a second click in the same event loop never starts another request',()=>{
 const gate=createSubmissionGate();
 assert.equal(gate.begin(),true);
 assert.equal(gate.begin(),false);
 assert.equal(gate.phase,'sending');
 assert.equal(gate.locked,true);
});
test('V2.21: ambiguous result cannot be cleared by UI refresh or repeated submit',()=>{
 const gate=createSubmissionGate();gate.begin();gate.uncertain();
 assert.equal(gate.phase,'uncertain');
 assert.equal(gate.begin(),false);
 assert.equal(gate.nextAfterRefresh(),false);
 assert.equal(gate.begin(),false);
 assert.match(submissionLockedMessage,/Không gửi lại/);
});
test('V2.21: a known validation rejection permits corrected input but acknowledged write does not replay',()=>{
 const rejected=createSubmissionGate();rejected.begin();rejected.rejected();
 assert.equal(rejected.begin(),true);
 const confirmed=createSubmissionGate();confirmed.begin();confirmed.confirmed();
 assert.equal(confirmed.begin(),false);
 assert.equal(confirmed.locked,true);
});
test('V2.21: next import batch is allowed only after server ACK plus successful refresh',()=>{
 const gate=createSubmissionGate();assert.equal(gate.nextAfterRefresh(),false);
 gate.begin();gate.confirmed();assert.equal(gate.nextAfterRefresh(),true);
 assert.equal(gate.begin(),true);
 gate.uncertain();assert.equal(gate.nextAfterRefresh(),false);
});
test('V2.21: cannot forge confirmation while idle',()=>{
 const gate=createSubmissionGate();
 assert.throws(()=>gate.confirmed(),/pending/);
 assert.throws(()=>gate.uncertain(),/pending/);
});
test('V2.21: edit form retains input but blocks uncertain outcome even after global acknowledgment',()=>{
 const app=source('App.jsx');
 assert.match(app,/editUnverified/);
 assert.match(app,/setEditUnverified\(true\);await flagUncertain/);
 assert.match(app,/if\(busy\|\|conflict\|\|unverified\|\|\(trackedDossier&&!changesPending\)\)return/);
 assert.match(app,/disabled=\{conflict\|\|unverified\|\|\(trackedDossier&&!changesPending\)\|\|\(needsReview&&reviewVisible&&!review\.valid\)\}/);
 assert.match(app,/Không gửi lại từ biểu mẫu này/);
});
test('V2.21: bulk and import commits use synchronous latch, never retry an unknown outcome',()=>{
 for(const component of ['components/BulkUnitPanel.jsx','components/ImportPanel.jsx']){
  const file=source(component);
  assert.match(file,/createSubmissionGate\(\)/);
  assert.match(file,/gate\.current\.begin\(\)/);
  assert.match(file,/gate\.current\.uncertain\(\)/);
  assert.match(file,/await onUncertain\?\.\(\)/);
  assert.match(file,/canCommit\?\.\(\)/);
  assert.match(file,/gate\.current\.confirmed\(\)/);
 }
 const app=source('App.jsx');
 assert.match(app,/onUncertain=\{flagUncertain\} canCommit=\{requireFreshState\}/);
});
test('V2.21: import ACK with failed refresh is explicitly reported, not an ordinary success',()=>{
 const importPanel=source('components/ImportPanel.jsx');
 assert.match(importPanel,/refreshed===false\?/);
 assert.match(importPanel,/chưa tải lại được danh mục/);
 assert.match(importPanel,/nextAfterRefresh\(\)/);
});
test('V2.21: reminder refresh is covered by the same safe write and stale-state checks',()=>{
 const app=source('App.jsx');
 const begin=app.indexOf('const updateReminders=async()=>');
 const end=app.indexOf('const reminderPage=()=>',begin);
 assert.ok(begin>0&&end>begin);
 const block=app.slice(begin,end);
 assert.match(block,/actionInFlight\.current\|\|!requireFreshState\(\)/);
 assert.match(block,/acknowledgedWriteNotice/);
 assert.match(block,/if\(isOutcomeUncertain\(e\)\)await flagUncertain\(\)/);
});
