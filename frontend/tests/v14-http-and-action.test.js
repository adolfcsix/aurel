import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {api,apiBinary,setCsrf} from '../src/lib/http.js';

const src=readFileSync(new URL('../src/components/MobileRecords.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/estate-studio.css',import.meta.url),'utf8');

test('V1.4: profile action uses a quiet internal-navigation chevron, not a diagonal external-link icon',()=>{
 assert.match(src,/Xem hồ sơ<\/span><span className="aurel-record-action-icon"><Icon name="chevron"/);
 assert.doesNotMatch(src,/Xem hồ sơ <Icon name="up"/);
 assert.match(css,/\.aurel-record-action-icon/);
 assert.match(src,/onClick=\{\(\)=>onOpen\(u\.id\)\}/);
 assert.match(src,/aria-label=\{'Xem hồ sơ căn '/);
});

test('V1.4: JSON API keeps CSRF and cookies with custom headers',async()=>{
 const old=globalThis.fetch;let observed;
 try{
  globalThis.fetch=async(url,options)=>{observed={url,options};return {ok:true,json:async()=>({ok:true})}};
  setCsrf('token-test');
  const result=await api('/units/one',{method:'PATCH',body:{feePercent:3.7},headers:{'X-Request-ID':'change-01'}});
  assert.deepEqual(result,{ok:true});
  assert.equal(observed.url,'/api/units/one');
  assert.equal(observed.options.credentials,'same-origin');
  assert.equal(observed.options.headers['Content-Type'],'application/json');
  assert.equal(observed.options.headers['X-CSRF-Token'],'token-test');
  assert.equal(observed.options.headers['X-Request-ID'],'change-01');
  assert.deepEqual(JSON.parse(observed.options.body),{feePercent:3.7});
 }finally{globalThis.fetch=old;setCsrf('')}
});

test('V1.4: GET stays without a JSON content type and HTTP errors retain status',async()=>{
 const old=globalThis.fetch;let observed;
 try{
  globalThis.fetch=async(url,options)=>{observed=options;return {ok:false,status:409,json:async()=>({error:'Hồ sơ đã thay đổi'})}};
  setCsrf('token-test');
  await assert.rejects(()=>api('/units/one',{method:'GET',headers:{'X-Trace':'ok'}}),e=>e.status===409&&e.message==='Hồ sơ đã thay đổi');
  assert.equal(observed.headers['Content-Type'],undefined);
  assert.equal(observed.headers['X-CSRF-Token'],undefined);
  assert.equal(observed.headers['X-Trace'],'ok');
 }finally{globalThis.fetch=old;setCsrf('')}
});

test('V1.4: binary import request keeps anti-CSRF header and original bytes',async()=>{
 const old=globalThis.fetch;let observed;
 try{
  const bytes=new Uint8Array([80,75,3,4]);
  globalThis.fetch=async(_url,options)=>{observed=options;return {ok:true,json:async()=>({sheets:[]})}};
  setCsrf('upload-token');
  await apiBinary('/import/units/xlsx/inspect',{body:bytes,headers:{'X-Import-Trace':'v14'}});
  assert.equal(observed.headers['X-CSRF-Token'],'upload-token');
  assert.equal(observed.headers['X-Import-Trace'],'v14');
  assert.equal(observed.headers['Content-Type'],'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(observed.body,bytes);
 }finally{globalThis.fetch=old;setCsrf('')}
});

test('V1.4: primary actions on lease, payment and deposit cards share one icon treatment',()=>{
 const mainActions=src.match(/className="aurel-record-action"/g)||[];
 const iconContainers=src.match(/className="aurel-record-action-icon"/g)||[];
 assert.equal(mainActions.length,5);
 assert.equal(iconContainers.length,5);
});
