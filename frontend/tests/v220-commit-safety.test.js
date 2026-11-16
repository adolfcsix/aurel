import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {api,apiBinary,setCsrf} from '../src/lib/http.js';
import {isWriteMethod,isWriteBlocked,isOutcomeUncertain,blockedWriteMessage,acknowledgedWriteNotice,uncertainWriteNotice} from '../src/lib/commit-safety.js';

const read=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const response=(status,data)=>({status,ok:status>=200&&status<300,json:async()=>data});
const withFetch=async(stub,run)=>{const original=globalThis.fetch;globalThis.fetch=stub;
 try{return await run()}finally{globalThis.fetch=original;setCsrf('')}};

test('V2.20: safe classification distinguishes reads, writes and replay risk',()=>{
 for(const method of ['POST','PATCH','PUT','DELETE','post'])assert.equal(isWriteMethod(method),true);
 for(const method of ['GET','HEAD','OPTIONS','get',undefined])assert.equal(isWriteMethod(method),false);
 assert.equal(isOutcomeUncertain({uncertain:true}),true);
 assert.equal(isOutcomeUncertain({status:409}),false);
 assert.equal(isOutcomeUncertain(null),false);
});
test('V2.20: stale, unknown and conflict states block new writes',()=>{
 assert.equal(isWriteBlocked(),false);
 for(const state of [{loadError:'ECONNRESET'},{verificationRequired:true},{editConflict:true}]){
  assert.equal(isWriteBlocked(state),true);assert.ok(blockedWriteMessage(state).length>20);
 }
 assert.match(blockedWriteMessage({verificationRequired:true,loadError:'error'}),/chưa được xác minh/);
 assert.match(uncertainWriteNotice,/Không gửi lại lệnh/);
});
test('V2.20: acknowledged API write with refresh failure must never be shown as normal success',()=>{
 assert.deepEqual(acknowledgedWriteNotice({refreshed:true,success:'Đã lưu.'}),{message:'Đã lưu.',error:false});
 const uncertain=acknowledgedWriteNotice({refreshed:false,success:'Đã lưu.'});
 assert.equal(uncertain.error,true);assert.match(uncertain.message,/Máy chủ đã xác nhận/);
 assert.match(uncertain.message,/Không thực hiện lại/);
});
test('V2.20: failed GET connection is retryable, not a possibly committed ledger mutation',async()=>{
 await withFetch(async()=>{throw new TypeError('offline')},async()=>{
  await assert.rejects(api('/state'),e=>e.code==='NETWORK_ERROR'&&e.uncertain===false);
 });
});
test('V2.20: failed POST connection has unknown outcome; request retains CSRF and same-origin',async()=>{
 setCsrf('qa-csrf-token');let seen;
 await withFetch(async(_url,init)=>{seen=init;throw new TypeError('connection dropped')},async()=>{
  await assert.rejects(api('/payments',{method:'POST',body:{amount:1200000}}),e=>e.code==='NETWORK_ERROR'&&e.uncertain===true);
 });
 assert.equal(seen.credentials,'same-origin');assert.equal(seen.headers['X-CSRF-Token'],'qa-csrf-token');
 assert.equal(JSON.parse(seen.body).amount,1200000);
});
test('V2.20: HTTP 409 is known conflict; HTTP 503 write outcome is uncertain',async()=>{
 await withFetch(async()=>response(409,{error:'Stale revision'}),async()=>{
  await assert.rejects(api('/units/id',{method:'PATCH',body:{}}),e=>e.status===409&&e.uncertain===false);
 });
 await withFetch(async()=>response(503,{error:'Unavailable'}),async()=>{
  await assert.rejects(api('/payments',{method:'POST',body:{}}),e=>e.status===503&&e.uncertain===true);
  await assert.rejects(api('/state'),e=>e.status===503&&e.uncertain===false);
 });
});
test('V2.20: successful mutations and binary uploads preserve their API contracts',async()=>{
 await withFetch(async(url,init)=>{
  assert.equal(init.credentials,'same-origin');assert.equal(init.method,'POST');
  if(url.includes('xlsx'))assert.match(init.headers['Content-Type'],/spreadsheetml/);
  return response(201,{ok:true,id:'qa'})
 },async()=>{
  assert.equal((await api('/payments',{method:'POST',body:{amount:1}})).id,'qa');
  assert.equal((await apiBinary('/import/units/xlsx/commit',{body:new Uint8Array([1,2,3])})).ok,true);
 });
});
test('V2.20: React wiring displays a persistent state banner and explicit reconciliation gate',()=>{
 const app=read('App.jsx'),main=read('main.jsx'),css=read('atelier-v220.css');
 assert.match(main,/atelier-v220\.css/);
 assert.match(app,/verificationRequired/);assert.match(app,/aurel-sync-banner/);
 assert.match(app,/Tôi đã đối chiếu/);assert.match(app,/requireFreshState\(\)/);
 assert.match(app,/onUncertain=\{flagUncertain\}/);
 assert.match(app,/editConflict/);assert.match(app,/aurel-reconcile-note/);
 assert.match(css,/min-height:44px/);assert.match(css,/max-width:390px/);
 assert.match(css,/aurel-reconcile-note/);
});
test('V2.20: lease close locks acknowledged or uncertain mutations and restores focus',()=>{
 const source=read('components/CloseLeaseDialog.jsx');
 assert.match(source,/writeLock\.current/);
 assert.match(source,/const frozen=committed\|\|unknown/);
 assert.match(source,/if\(writeLock\.current\|\|frozen\|\|busy/);
 assert.match(source,/acknowledged=true;setCommitted\(true\)/);
 assert.match(source,/await onUncertain\(\)/);
 assert.match(source,/await onConflict\(\)/);
 assert.match(source,/aria-modal="true"/);
 assert.match(source,/previous\.focus/);
});

test('V2.20: local-network mobile browser generates safe UUID without randomUUID',async()=>{
 const {secureRequestKey,uuidV4FromBytes}=await import('../src/lib/commit-safety.js');
 const bytes=Uint8Array.from({length:16},(_,i)=>i);
 const before=Uint8Array.from(bytes);
 const generated=secureRequestKey({getRandomValues(target){target.set(bytes);return target}});
 assert.match(generated,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
 assert.deepEqual(Array.from(bytes),Array.from(before),'input bytes remain unmodified');
 assert.equal(generated,uuidV4FromBytes(bytes));
 assert.equal(secureRequestKey({randomUUID(){return 'native-uuid'}}),'native-uuid');
 assert.throws(()=>secureRequestKey({}),/an toàn|HTTPS/);
 assert.throws(()=>uuidV4FromBytes(new Uint8Array(4)),TypeError);
 assert.match(read('App.jsx'),/secureRequestKey\(\)/);
});

test('V2.20: malformed successful response never masquerades as a valid acknowledgment',async()=>{
 await withFetch(async()=>({ok:true,status:200,json:async()=>{throw new SyntaxError('bad JSON')}}),async()=>{
  await assert.rejects(api('/state'),e=>e.code==='INVALID_RESPONSE'&&!e.uncertain);
  await assert.rejects(api('/payments',{method:'POST',body:{amount:10}}),e=>e.code==='INVALID_RESPONSE'&&e.uncertain);
  await assert.rejects(apiBinary('/import/units/xlsx/commit',{body:new Uint8Array([1])}),e=>e.code==='INVALID_RESPONSE'&&e.uncertain);
 });
});
