import test from 'node:test';
import assert from 'node:assert/strict';
import {api,apiBinary,setCsrf} from '../src/lib/http.js';
import {withRequestDeadline} from '../src/lib/request-deadline.js';

test('hung GET is released, aborts transport and does not retry',async()=>{
 const original=globalThis.fetch;let calls=0,signal;
 try{
  globalThis.fetch=async(_,options)=>{calls++;signal=options.signal;return new Promise(()=>{})};
  await assert.rejects(api('/state',{timeoutMs:15}),e=>e.code==='REQUEST_TIMEOUT'&&!e.uncertain);
  assert.equal(calls,1);assert.equal(signal.aborted,true);
 }finally{globalThis.fetch=original}
});
test('timeout covers response body and marks a financial write uncertain',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;return {ok:true,json:()=>new Promise(()=>{})}};
  await assert.rejects(api('/payments',{method:'POST',body:{amount:100},timeoutMs:15}),e=>e.code==='REQUEST_TIMEOUT'&&e.uncertain);
  assert.equal(calls,1);
 }finally{globalThis.fetch=original}
});
test('binary import has the same deadline and preserves bytes, CSRF and uncertain outcome',async()=>{
 const original=globalThis.fetch;let options;
 try{
  setCsrf('qa-token');const body=new Uint8Array([80,75]);
  globalThis.fetch=async(_,value)=>{options=value;return new Promise(()=>{})};
  await assert.rejects(apiBinary('/import/units/xlsx/commit',{body,timeoutMs:15}),e=>e.uncertain&&e.code==='REQUEST_TIMEOUT');
  assert.equal(options.body,body);assert.equal(options.headers['X-CSRF-Token'],'qa-token');
 }finally{globalThis.fetch=original;setCsrf('')}
});
test('null error bodies retain HTTP status and safe outcome classification',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>({ok:false,status:503,json:async()=>null});
  await assert.rejects(api('/payments',{method:'POST'}),e=>e.status===503&&e.uncertain&&e.message==='Không thể thực hiện yêu cầu');
 }finally{globalThis.fetch=original}
});
test('cancelled work never starts transport and caller abort listeners are cleaned',async()=>{
 const controller=new AbortController();controller.abort();let called=false;
 await assert.rejects(withRequestDeadline(()=>{called=true},{signal:controller.signal}),e=>e.name==='AbortError');
 assert.equal(called,false);
 const target=new EventTarget();let added=0,removed=0;
 const signal={aborted:false,addEventListener(...args){added++;target.addEventListener(...args)},removeEventListener(...args){removed++;target.removeEventListener(...args)}};
 assert.equal(await withRequestDeadline(async()=>42,{signal,timeoutMs:20}),42);
 assert.equal(added,removed);
});
