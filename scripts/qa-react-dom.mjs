/** React/DOM behavior regression suite. Does not prove browser geometry or CSS. */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {unlink} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {seed} from '../backend/src/seed.js';
import {upgrade} from '../backend/src/store.js';
import {stateResponse} from '../backend/src/state-access.js';
import {scanDataQuality} from '../backend/src/data-quality.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,`.aurel-dom-${process.pid}.mjs`);
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://localhost/',pretendToBeVisual:true});
for(const key of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Event','MouseEvent','InputEvent']){
 Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
}
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
window.matchMedia=query=>({matches:false,media:query,addEventListener(){},removeEventListener(){}});
globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);
const originalFetch=globalThis.fetch;
let reactRoot,checks=0;
try{
 await build({stdin:{contents:`export {default as ImportPanel} from '../frontend/src/components/ImportPanel.jsx';
 export {default as AppRecovery} from '../frontend/src/components/AppRecovery.jsx';
 export {OwnerChangeForm} from '../frontend/src/components/OwnerChangeRequests.jsx';
 export {default as App} from '../frontend/src/App.jsx';
 export {default as AuthPortal} from '../frontend/src/components/AuthPortal.jsx';`,resolveDir:path.join(root,'scripts')},
  outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
 const React=await import('react');const {act}=React;
 const {createRoot}=await import('react-dom/client');
 const {ImportPanel,AppRecovery,OwnerChangeForm,App,AuthPortal}=await import(pathToFileURL(output));
 const host=document.getElementById('root');reactRoot=createRoot(host);
 const render=async(element)=>act(async()=>reactRoot.render(element));
 const click=async(text)=>{const b=[...host.querySelectorAll('button')].find(x=>x.textContent.trim()===text);assert.ok(b,'Missing button '+text);await act(async()=>b.click());return b};
 const input=async(selector,value)=>{const element=host.querySelector(selector);assert.ok(element,selector);
  const proto=element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
  await act(async()=>{Object.getOwnPropertyDescriptor(proto,'value').set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}))});
 };
 const unloadBlocked=()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented};
 // Exercise authentication events independently of layout and live credentials.
 let authChecks=0,loginCalls=0,releaseLogin,registered=null;
 await render(React.createElement(AuthPortal,{onLogin:async(username,password)=>{
  assert.equal(username,'qa.user');assert.equal(password,'PrivateLogin123');loginCalls++;
  await new Promise(resolve=>releaseLogin=resolve);
 },onRegistered:async response=>{registered=response}}));
 assert.doesNotMatch(host.textContent,/Chỉn chu|từng quyết định|SỰ TIN CẬY|Không gian tài khoản bảo mật/);authChecks++;
 await input('input[autocomplete="username"]','qa.user');
 await input('input[autocomplete="current-password"]','PrivateLogin123');
 await click('Hiện');assert.equal(host.querySelector('input[autocomplete="current-password"]').type,'text');authChecks++;
 // Select the explicit form submit event, independently of the navigation label.
 await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(loginCalls,1);assert.equal(host.querySelector('fieldset').disabled,true);
 await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(loginCalls,1);await click('Đăng ký');assert.equal(host.querySelector('input[autocomplete="name"]'),null);authChecks++;
 await act(async()=>releaseLogin());
 await click('Đăng ký');
 assert.equal(host.querySelectorAll('input[type="password"]').length,2);
 assert.equal([...host.querySelectorAll('input[autocomplete="new-password"]')].every(x=>!x.value),true);authChecks++;
 await input('input[autocomplete="name"]','QA Account');
 await input('input[autocomplete="username"]','qa.registration');
 const newFields=[...host.querySelectorAll('input[autocomplete="new-password"]')];
 await input(`[id="${newFields[0].id}"]`,'NewPrivatePassword123');
 await input(`[id="${newFields[1].id}"]`,'OtherPrivatePassword123');
 let registerCalls=0;
 globalThis.fetch=async(_url,options)=>{
  registerCalls++;assert.deepEqual(JSON.parse(options.body),{username:'qa.registration',name:'QA Account',password:'NewPrivatePassword123'});
  return {ok:true,json:async()=>({user:{role:'viewer',id:'qa-account'},csrf:'qa-session'})};
 };
 await click('Tạo tài khoản');assert.ok(host.querySelector('[role="alert"]'));assert.equal(registerCalls,0);authChecks++;
 await input(`[id="${newFields[1].id}"]`,'NewPrivatePassword123');
 await click('Tạo tài khoản');assert.equal(registered.user.role,'viewer');assert.equal(registered.csrf,'qa-session');authChecks++;
 await click('Đăng nhập');await click('Quên mật khẩu?');
 assert.ok(host.querySelector('.aurel-entry-help'));assert.equal(host.querySelector('form'),null);
 await click('Dùng mật khẩu tạm');assert.equal(host.querySelectorAll('input[type="password"]').length,3);authChecks++;
 await input('input[autocomplete="current-password"]','TemporaryPassword123');
 const activateFields=[...host.querySelectorAll('input[autocomplete="new-password"]')];
 for(const element of activateFields)await input(`[id="${element.id}"]`,'ActivatedPassword123');
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,'/api/auth/activate');assert.equal(JSON.parse(options.body).temporaryPassword,'TemporaryPassword123');
  return {ok:true,json:async()=>({activated:true})};
 };
 await click('Lưu mật khẩu');assert.ok(host.querySelector('[role="status"]'));assert.equal(host.querySelector('input[autocomplete="current-password"]').value,'');authChecks++;
 await render(React.createElement(AuthPortal,{key:'login-error',onLogin:async()=>{throw Error('Tài khoản hoặc mật khẩu không đúng.')}}));
 await input('input[autocomplete="username"]','qa.user');await input('input[autocomplete="current-password"]','PrivateLogin123');
 await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.ok(host.querySelector('[role="alert"]'));assert.equal(host.querySelector('fieldset').disabled,false);authChecks++;
 await render(React.createElement(ImportPanel,{onImported:async()=>true,canCommit:()=>true}));
 await click('CSV UTF-8');await input('.import-textarea','Mã căn\nQA-DOM-1');
 assert.equal(unloadBlocked(),true,'CSV draft needs unload protection');checks++;
 let finish,calls=0;
 globalThis.fetch=async()=>{calls++;return new Promise(resolve=>finish=resolve)};
 await click('Kiểm tra dữ liệu');
 assert.equal(host.querySelector('fieldset').disabled,true);
 assert.equal(host.querySelector('.import-textarea').matches(':disabled'),true);
 await click('Excel .xlsx');
 assert.ok(host.querySelector('.import-textarea'),'Format must not change while checking');
 assert.equal(calls,1);checks++;
 await act(async()=>finish({ok:true,json:async()=>({total:1,valid:1,duplicates:0,errors:[],warnings:[],preview:[{code:'QA-DOM-1'}],digest:'test',previewToken:'test'})}));
 assert.equal(host.querySelector('fieldset').disabled,false);
 assert.ok(host.textContent.includes('Xác nhận nhập 1 căn'));checks++;
 await click('Excel .xlsx');await click('CSV UTF-8');
 assert.equal(host.querySelector('.import-textarea').value,'');
 assert.equal(host.querySelector('.import-results .import-placeholder')!==null,true);
 assert.equal(unloadBlocked(),false);checks++;
 await input('.import-textarea','Mã căn\nQA-DOM-2');
 globalThis.fetch=async()=>({ok:true,json:async()=>({total:1,valid:1,duplicates:0,errors:[],warnings:[],preview:[],digest:'d2',previewToken:'p2'})});
 await click('Kiểm tra dữ liệu');
 globalThis.fetch=async()=>{calls++;throw new Error('Disconnected after commit')};
 await click('Xác nhận nhập 1 căn');
 assert.equal(host.querySelector('fieldset').disabled,true);
 assert.ok(host.querySelector('[role="alert"]'));
 assert.equal(host.querySelector('button').matches(':disabled'),true);checks++;
 await render(React.createElement(OwnerChangeForm,{key:'owner',unit:{id:'u1',address:'Địa chỉ gốc'},requests:[],notify:()=>{},onSaved:async()=>true}));
 assert.equal(unloadBlocked(),false,'Unmount removes import guard');
 await input('.aurel-owner-correction input','Địa chỉ mới');
 assert.equal(unloadBlocked(),true);
 await input('.aurel-owner-correction input','Địa chỉ gốc');
 assert.equal(unloadBlocked(),false);checks++;
 const oldError=console.error;console.error=()=>{};
 try{
  function Broken(){throw Error('QA-only render fault')}
  await render(React.createElement(AppRecovery,null,React.createElement(Broken)));
 }finally{console.error=oldError}
 assert.ok(host.querySelector('main[role="alert"] h1'));
 assert.equal([...host.querySelectorAll('button')].some(x=>x.textContent.includes('Tải lại ứng dụng')),true);
 assert.equal(host.textContent.includes('QA-only render fault'),false);checks++;
 const fixture=upgrade(seed());let screens=0;
 const errors=[],savedConsole=console.error;console.error=(...args)=>errors.push(args.map(String).join(' '));
 try{
  for(const [role,count] of Object.entries({admin:16,manager:16,accountant:8,staff:7,viewer:4})){
   const user={id:'dom-'+role,name:'QA '+role,username:role,role,staffId:'s1',favoriteUnitIds:[],ownedUnitCount:0};
   const state=stateResponse({user},fixture,u=>({id:u.id,name:u.name,username:u.username,role:u.role}));
   globalThis.fetch=async url=>{
    const payload=url==='/api/auth/me'?{user,csrf:'qa-dom'}:url==='/api/state'?state:
     url==='/api/quality'?scanDataQuality(fixture):[];
    return {ok:true,json:async()=>structuredClone(payload)};
   };
   await render(React.createElement(AppRecovery,{key:role},React.createElement(App)));
   assert.ok(host.querySelector('.app-shell'),role+' workspace must render');
   const labels=[...host.querySelectorAll('.sidenav .nav-item:not(:disabled) > span')].map(x=>x.textContent.trim());
   assert.equal(labels.length,count,role+' route count');
   for(const label of labels){
    const item=[...host.querySelectorAll('.sidenav .nav-item:not(:disabled)')].find(x=>x.querySelector('span')?.textContent.trim()===label);
    assert.ok(item,role+' '+label);
    await act(async()=>item.click());
    assert.ok(host.querySelector('.content-wrap')?.textContent.trim().length>30,role+' empty page '+label+' '+errors.join(' | '));
    assert.equal(host.querySelector('.aurel-recovery'),null,role+' crashed on '+label);
    screens++;
   }
   if(role==='viewer'){
    await input('#aurel-profile-name','QA tên mới');assert.equal(unloadBlocked(),true);
    await input('#aurel-profile-name',user.name);assert.equal(unloadBlocked(),false);checks++;
   }
  }
 }finally{console.error=savedConsole}
 assert.deepEqual(errors,[],'React should not emit runtime errors or missing-key warnings');
 console.log(`PASS React/DOM: ${authChecks} account checks, ${checks} workspace behavioral checks and ${screens} permitted screens across five roles. Browser geometry, physical devices and PostgreSQL NOT VERIFIED.`);
}finally{
 globalThis.fetch=originalFetch;
 if(reactRoot){const {act}=await import('react');await act(async()=>reactRoot.unmount())}
 dom.window.close();await unlink(output).catch(()=>{});
}
