import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSessionBoundary} from '../src/lib/session-boundary.js';

const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const quality=readFileSync(new URL('../src/components/DataQualityCenter.jsx',import.meta.url),'utf8');
const src=(start,end)=>app.slice(app.indexOf(start),app.indexOf(end));
const defer=()=>{let resolve;const promise=new Promise(ok=>{resolve=ok});return {promise,resolve}};

// Model the same account-generation + latest-request predicate used by the React
// callbacks. This is a real async race test, not just a source-string assertion.
async function scopedRead(account,resource,network,commit){
 const identity=account.capture(),request=resource.invalidate();
 const value=await network;
 if(account.matches(identity)&&resource.matches(request))commit(value);
}

test('V2.78 admin read cannot repopulate a different account after a late response',async()=>{
 const account=createSessionBoundary(),qualityFence=createSessionBoundary(),old=defer();
 let current='viewer';
 const pending=scopedRead(account,qualityFence,old.promise,value=>current=value);
 account.invalidate();qualityFence.invalidate();old.resolve('admin quality data');
 await pending;
 assert.equal(current,'viewer');
});

test('V2.78 newest archive refresh wins even when the older response arrives last',async()=>{
 const account=createSessionBoundary(),archiveFence=createSessionBoundary(),first=defer(),second=defer();
 const results=[];
 const older=scopedRead(account,archiveFence,first.promise,value=>results.push(value));
 const newer=scopedRead(account,archiveFence,second.promise,value=>results.push(value));
 second.resolve('new list');await newer;
 first.resolve('stale list');await older;
 assert.deepEqual(results,['new list']);
});

test('V2.78 quality and archive reads are doubly fenced to account and latest request',()=>{
 assert.match(app,/qualityBoundary=useMemo\(createSessionBoundary,\[\]\),archiveBoundary=useMemo\(createSessionBoundary,\[\]\)/);
 for(const [start,end,boundary] of [
  [' const refreshQuality=useCallback(',' useEffect(()=>{if(page===\'quality\'', 'qualityBoundary'],
  [' const refreshArchives=useCallback(',' useEffect(()=>{if(page===\'archives\'', 'archiveBoundary']
 ]){
  const body=src(start,end);
  assert.ok(body.startsWith(start),start);
  assert.ok(body.includes('sessionBoundary.capture()'),`${boundary}: missing account fence`);
  assert.ok(body.includes(`${boundary}.invalidate()`),`${boundary}: missing latest request fence`);
  assert.ok(body.includes(`!sessionBoundary.matches(identity)||!${boundary}.matches(request)`),`${boundary}: success not fenced`);
  assert.ok(body.includes(`sessionBoundary.matches(identity)&&${boundary}.matches(request)`),`${boundary}: error/finally not fenced`);
 }
});

test('V2.78 account transitions invalidate sensitive read generations and clear loaders',()=>{
 for(const [start,end] of [
  [' const login=async(', ' const registered=async('],
  [' const registered=async(', ' const toggleFavorite=async('],
  [' const logout=async()', ' const can=(permission)']
 ]){
  const section=src(start,end);
  for(const token of ['qualityBoundary.invalidate()','archiveBoundary.invalidate()','setQualityLoading(false)','setArchivesLoading(false)','setProfileSaving(false)']){
   assert.ok(section.includes(token),`${start}: ${token}`);
  }
 }
 const authExpired=src(' const load=useCallback(', ' useEffect(()=>{const identity=sessionBoundary.capture()');
 assert.match(authExpired,/e\.status===401[\s\S]*qualityBoundary\.invalidate\(\);archiveBoundary\.invalidate\(\)/);
});

test('V2.78 favorite and profile responses cannot change the next account',()=>{
 for(const [start,end] of [
  [' const saveProfile=async(', ' const login=async('],
  [' const toggleFavorite=async(', ' const logout=async()']
 ]){
  const body=src(start,end);
  assert.match(body,/const identity=sessionBoundary\.capture\(\)/);
  assert.match(body,/if\(!sessionBoundary\.matches\(identity\)\)return/);
  assert.match(body,/catch\(error\)\{if\(sessionBoundary\.matches\(identity\)\)/);
 }
});

test('V2.78 owner notes and admin verification do not announce an old account operation',()=>{
 for(const [start,end] of [
  [' const saveOwnerNote=async(', ' const changeOwnerLink=async('],
  [' const changeOwnerLink=async(', ' const saveProfile=async(']
 ]){
  const body=src(start,end);
  assert.match(body,/const identity=sessionBoundary\.capture\(\)/);
  if(start.includes('saveOwnerNote')){
   assert.match(body,/attempt=ownerNoteFence\.invalidate\(\)/);
   assert.match(body,/const active=\(\)=>sessionBoundary\.matches\(identity\)&&ownerNoteFence\.matches\(attempt\)/);
   assert.match(body,/if\(!active\(\)\)return/);
   assert.match(body,/catch\(error\)\{if\(active\(\)\)/);
  }else{
   assert.match(body,/if\(!sessionBoundary\.matches\(identity\)\)return/);
   assert.match(body,/catch\(error\)\{if\(sessionBoundary\.matches\(identity\)\)/);
  }
 }
});

test('V2.78 profile Save prevents duplicate submissions and displays progress',()=>{
 assert.match(app,/if\(profileBusy\.current\|\|profileSaving\|\|profileName\.trim\(\)\.length<2\)return/);
 assert.match(app,/disabled=\{profileSaving\} aria-busy=\{profileSaving\}/);
 assert.match(app,/profileSaving\?'Đang lưu…':'Lưu tên hiển thị'/);
});

test('V2.78 no quality report is NEVER presented as zero problems',()=>{
 assert.match(quality,/const hasResult=Boolean\(report\)/);
 assert.match(quality,/hasResult\?summary\.critical:'—'/);
 assert.match(quality,/chưa có kết quả đối soát/);
 assert.match(quality,/!error&&!loading&&!report&&/);
 assert.match(quality,/!error&&!loading&&hasResult&&issues\.length===0/);
});

test('V2.78 archive loading and failure hide outdated rows rather than falsely showing empty success',()=>{
 const archive=src(' const archivePage=()', ' const importPage=()');
 assert.match(archive,/disabled=\{archivesLoading\}/);
 assert.match(archive,/archiveError&&<div className="notice-line" role="alert">/);
 assert.match(archive,/archivesLoading\?<p role="status"/);
 assert.match(archive,/!archiveError&&<Table empty=/);
});

test('V2.78 action completions from an old user are ignored after logout',async()=>{
 const account=createSessionBoundary(),actions=createSessionBoundary(),slow=defer();
 const identity=account.capture(),attempt=actions.invalidate();
 const isCurrent=()=>account.matches(identity)&&actions.matches(attempt);
 let notification='';
 const finished=slow.promise.then(()=>{if(isCurrent())notification='Admin changed a ledger entry'});
 account.invalidate();actions.invalidate();slow.resolve();await finished;
 assert.equal(notification,'');
});

test('V2.78 old in-flight action cannot reset the new action busy indicator',async()=>{
 const actions=createSessionBoundary(),oldAttempt=actions.invalidate(),slow=defer();
 let busy=true;
 const oldFinal=slow.promise.finally(()=>{if(actions.matches(oldAttempt))busy=false});
 actions.invalidate();busy=true;
 slow.resolve();await oldFinal;
 assert.equal(busy,true);
});

test('V2.78 financial writes and approvals fence both successful and rejected responses',()=>{
 for(const [start,end] of [
  [' const confirmAction=async()', ' const save=async('],
  [' const save=async(', ' const actionRight=('],
  [' const updateReminders=async()', ' const reminderPage=()']
 ]){
  const body=src(start,end);
  assert.match(body,/const identity=sessionBoundary\.capture\(\),attempt=actionFence\.invalidate\(\)/);
  assert.match(body,/const active=\(\)=>sessionBoundary\.matches\(identity\)&&actionFence\.matches\(attempt\)/);
  assert.match(body,/if\(!active\(\)\)return/);
  assert.match(body,/catch\(e\)\{if\(!active\(\)\)return/);
  assert.match(body,/finally\{if\(active\(\)\)\{actionInFlight\.current=false;setBusy\(false\)\}\}/);
 }
});

test('V2.78 account transitions release stale action lock before a new account starts',()=>{
 for(const [start,end] of [
  [' const login=async(', ' const registered=async('],
  [' const registered=async(', ' const toggleFavorite=async('],
  [' const logout=async()', ' const can=(permission)']
 ]){
  const body=src(start,end);
  assert.match(body,/actionFence\.invalidate\(\);ownerNoteFence\.invalidate\(\);ownerNoteBusy\.current=false;ownerNoteDirty\.current\.clear\(\);setSavingOwnerNoteId\(null\);actionInFlight\.current=false;setBusy\(false\)/);
 }
});


test('V2.78 unsaved owner notes survive a refresh; unowned drafts are discarded',()=>{
 assert.match(app,/const ownedIds=new Set\(rows\.map\(row=>String\(row\.id\)\)\)/);
 assert.match(app,/ownerNoteDirty\.current\.has\(id\)&&Object\.hasOwn\(previous,id\)\?previous\[id\]:row\.personalNote\|\|''/);
 assert.match(app,/if\(!ownedIds\.has\(dirtyId\)\)ownerNoteDirty\.current\.delete\(dirtyId\)/);
 assert.match(app,/ownerNoteDirty\.current\.add\(String\(unit\.id\)\)/);
});

test('V2.78 owner notes show saving state and block repeated clicks',()=>{
 const owner=src(' const saveOwnerNote=async(', ' const changeOwnerLink=async(');
 assert.match(owner,/if\(!requireFreshState\(\)\|\|ownerNoteBusy\.current\)return/);
 assert.match(owner,/ownerNoteBusy\.current=true;setSavingOwnerNoteId\(id\)/);
 assert.match(owner,/finally\{if\(active\(\)\)\{ownerNoteBusy\.current=false;setSavingOwnerNoteId\(null\)\}\}/);
 assert.match(app,/disabled=\{savingOwnerNoteId===String\(unit\.id\)\}/);
 assert.match(app,/busy=\{savingOwnerNoteId===String\(unit\.id\)\}/);
});
