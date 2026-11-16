/**
 * Real Chromium/React acceptance using Node >=22 native WebSocket and Chrome DevTools Protocol.
 * No Playwright, Selenium, global npm package, or connection to production data.
 * --driver-check exercises Chromium ONLY, never claims to verify React.
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
import {existsSync} from 'node:fs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const driverCheck=process.argv.includes('--driver-check');
// Explicit, opt-in screenshots from an isolated QA dataset; do not write into source or production data.
if(process.argv.includes('--evidence')&&!process.env.AUREL_QA_OUTPUT_DIR)process.env.AUREL_QA_OUTPUT_DIR=path.join(root,'qa-evidence');
const executable=process.env.AUREL_CHROME_BIN||(process.platform==='win32'
 ? [process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)'],process.env.LOCALAPPDATA].filter(Boolean)
    .flatMap(home=>[path.join(home,'Google/Chrome/Application/chrome.exe'),path.join(home,'Chromium/Application/chrome.exe')]).find(existsSync)
 : ['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'].find(existsSync));
const children=[];
let profile,workspace;
async function ephemeralPort(){const s=net.createServer();await new Promise((yes,no)=>s.once('error',no).listen(0,'127.0.0.1',yes));const {port}=s.address();await new Promise(yes=>s.close(yes));return port}
async function waitFor(url,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){try{const r=await fetch(url,{signal:AbortSignal.timeout(1400)});if(r.ok)return r}catch{}await pause(150)}throw Error('Server unavailable: '+new URL(url).origin)}
function start(cmd,args,options={}){const child=spawn(cmd,args,{cwd:root,stdio:['ignore','pipe','pipe'],...options});let log='';for(const stream of [child.stdout,child.stderr])stream?.on('data',x=>log=(log+x.toString()).slice(-2400));children.push(child);child.on('error',()=>{});return {child,get log(){return log}}}
class CDP{
 constructor(ws){this.ws=ws;this.count=0;this.pending=new Map();this.errors=[];
  ws.onmessage=event=>{let msg;try{msg=JSON.parse(event.data)}catch{return}if(msg.id){const waiter=this.pending.get(msg.id);if(!waiter)return;this.pending.delete(msg.id);if(msg.error)waiter.reject(Error(msg.error.message));else waiter.resolve(msg.result||{})}
   else if(msg.method==='Runtime.exceptionThrown')this.errors.push(msg.params?.exceptionDetails?.text||'Uncaught page exception');
   else if(msg.method==='Runtime.consoleAPICalled'&&msg.params?.type==='error')this.errors.push('JavaScript console.error: '+(msg.params.args||[]).map(arg=>arg.value||arg.description||'error').join(' ').slice(0,300))};
 }
 async send(method,params={}){const id=++this.count;return new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{this.pending.delete(id);reject(Error('Chromium command timed out: '+method))},15000);
  this.pending.set(id,{resolve:value=>{clearTimeout(timeout);resolve(value)},reject:error=>{clearTimeout(timeout);reject(error)}});
  try{this.ws.send(JSON.stringify({id,method,params}))}catch(error){this.pending.delete(id);clearTimeout(timeout);reject(error)}
 })}
 async eval(expression){const result=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text||'Browser expression failed');return result.result?.value}
 async until(expression,label,ms=16000){const end=Date.now()+ms;while(Date.now()<end){try{if(await this.eval(expression))return}catch(error){if(!/context|Cannot find|execution/i.test(error.message))throw error}await pause(130)}throw Error('Timed out waiting for '+label)}
 async viewport(width){await this.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<=768});}
 // Waiting for the URL is not enough: a reload to the *same* URL can
 // still be showing the previous document, giving CRUD tests false passes.
 async navigate(url){
  const marker=randomUUID();
  await this.eval(`window.__aurelQaPreviousDocument=${JSON.stringify(marker)}`);
  const response=await this.send('Page.navigate',{url});
  if(response.errorText)throw Error('Chromium navigation failed: '+response.errorText);
  const prefix=url.startsWith('data:')?'data:text/html,':url;
  const ready=`document.readyState==='complete' && location.href.startsWith(${JSON.stringify(prefix)}) && window.__aurelQaPreviousDocument!==${JSON.stringify(marker)}`;
  await this.until(ready,'new document at '+url.slice(0,80)).catch(async error=>{
   throw Error(error.message+'; saw '+JSON.stringify(await this.eval('({url:location.href,ready:document.readyState,body:document.body?.innerText?.slice(0,100)})')));
  });
 }
 // React controlled inputs need actual browser input events. In particular,
 // editing an existing rent must REPLACE its value, never append to it.
 async textInput(selector,value){
  const found=await this.eval(`(()=>{const x=document.querySelector(${JSON.stringify(selector)});if(!x||x.disabled||x.readOnly)return false;x.focus();return document.activeElement===x})()`);
  assert.ok(found,'Missing or inactive input '+selector);
  const mac=process.platform==='darwin',key=mac?'Meta':'Control',code=mac?'MetaLeft':'ControlLeft',vk=mac?91:17,modifier=mac?4:2;
  await this.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key,code,windowsVirtualKeyCode:vk,modifiers:modifier});
  await this.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:modifier});
  await this.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:modifier});
  await this.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk,modifiers:0});
  await this.send('Input.insertText',{text:String(value)});
 }
 async clickByText(selector,text){return this.eval(`(()=>{let n=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)} && !e.disabled);if(!n)return false;n.click();return true})()`)}
 close(){for(const waiter of this.pending.values())waiter.reject(Error('Browser disconnected'));this.pending.clear();this.ws.close()}
}
async function connectChrome(){if(!executable)throw Error('Chromium/Chrome not found. Install Chrome or set AUREL_CHROME_BIN to its executable.');const port=await ephemeralPort();profile=await mkdtemp(path.join(tmpdir(),'aurel-chrome-'));
 const args=['--headless=new','--disable-gpu','--no-first-run','--disable-default-apps','--disable-background-networking','--disable-dev-shm-usage',`--user-data-dir=${profile}`,`--remote-debugging-port=${port}`,'about:blank'];if(process.platform==='linux'&&process.getuid?.()===0)args.unshift('--no-sandbox');
 const p=start(executable,args);await waitFor(`http://127.0.0.1:${port}/json/version`,18000).catch(()=>{throw Error('Chromium debugging port unavailable: '+p.log)});
 const target=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());assert.ok(target.webSocketDebuggerUrl,'Could not open an isolated browser tab');const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=()=>reject(Error('Could not connect to Chromium CDP'))});const cdp=new CDP(ws);await cdp.send('Page.enable');await cdp.send('Runtime.enable');return cdp}
async function screenshot(cdp,label){
 if(!process.env.AUREL_QA_OUTPUT_DIR)return;
 const dest=path.resolve(process.env.AUREL_QA_OUTPUT_DIR);await mkdir(dest,{recursive:true});
 const capture=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 await writeFile(path.join(dest,`AUREL_V${JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version}_REACT_${label}.png`),Buffer.from(capture.data,'base64'));
}
// Use the rendered label rather than React's generated useId(), so fields remain
// addressable when form chapters or their order change.
async function fillLabeledField(cdp,label,value){
 const id=await cdp.eval(`(()=>{const field=[...document.querySelectorAll('.editor .form-field')].find(x=>x.querySelector('label')?.textContent.trim()===${JSON.stringify(label)});return field?.querySelector('input,textarea')?.id||null})()`);
 assert.ok(id,`Missing editor field: ${label}`);
 await cdp.textInput(`[id=${JSON.stringify(id)}]`,value);
}
async function browserApi(cdp,path,options={}){
 const arg=JSON.stringify({path,options});
 return cdp.eval(`(async()=>{const {path,options}=${arg};const r=await fetch('/api'+path,{credentials:'same-origin',...options});let body=null;try{body=await r.json()}catch{}return {status:r.status,body}})()`);
}
async function loginAs(cdp,url,username,password){
 await cdp.navigate(url);
 await cdp.until('Boolean(document.querySelector(".aurel-auth-submit"))','login form for '+username);
 await cdp.textInput('input[autocomplete="username"]',username);
 await cdp.textInput('input[autocomplete="current-password"]',password);
 assert.ok(await cdp.clickByText('.aurel-auth-submit','Đăng nhập'),'Login submit missing for '+username);
 await cdp.until('Boolean(document.querySelector(".app-shell .content-wrap"))','workspace for '+username);
}
async function checkLayout(cdp,width){const layout=await cdp.eval(`(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,logo:[...document.querySelectorAll('img')].filter(i=>i.src.includes('aurel-selected-wordmark')).map(i=>({ok:i.complete&&i.naturalWidth>0}))}))()`);assert.ok(layout.scroll<=layout.width+1,`Horizontal overflow at ${width}: ${layout.scroll}`);assert.ok(layout.logo.length&&layout.logo.every(x=>x.ok),`Selected AUREL logo is missing at ${width}`)}
// V2.73: visible menu contracts are independently specified for each role.
// Absence of an API permission must remove internal operations, not leave a
// misleading locked control. Ownership is the only viewer feature with a
// contextual lock while verification is pending.
const ROLE_NAVIGATION={
 admin:['Tổng quan','Danh mục căn hộ','Dự án, tòa & tầng','Hợp đồng thuê','Khoản thu & công nợ','Phí quản lý','Tiền cọc & hoàn cọc','Lịch nhắc thanh toán','Chủ sở hữu & khách thuê','Nhân viên & phân công','Báo cáo điều hành','Đối soát dữ liệu','Nhật ký thay đổi','Kho lưu trữ','Nhập tệp (tùy chọn)','Cài đặt & phân quyền'],
 manager:['Tổng quan','Danh mục căn hộ','Dự án, tòa & tầng','Hợp đồng thuê','Khoản thu & công nợ','Phí quản lý','Tiền cọc & hoàn cọc','Lịch nhắc thanh toán','Chủ sở hữu & khách thuê','Nhân viên & phân công','Báo cáo điều hành','Đối soát dữ liệu','Nhật ký thay đổi','Kho lưu trữ','Nhập tệp (tùy chọn)','Thiết lập vận hành'],
 accountant:['Tổng quan','Danh mục căn hộ','Dự án, tòa & tầng','Khoản thu & công nợ','Phí quản lý','Tiền cọc & hoàn cọc','Lịch nhắc thanh toán','Báo cáo điều hành'],
 staff:['Tổng quan','Danh mục căn hộ','Dự án, tòa & tầng','Hợp đồng thuê','Khoản thu & công nợ','Lịch nhắc thanh toán','Chủ sở hữu & khách thuê'],
 viewer:['Tổng quan','Danh mục căn hộ','Dự án, tòa & tầng','Hồ sơ cá nhân']
};
// Exercise actual navigation rather than only reading sidebar labels: every
// allowed route must render, remain within the viewport and not throw in React.
async function clickNavigationLabel(cdp,label){
 return cdp.eval(`(()=>{const n=[...document.querySelectorAll('.sidenav .nav-item:not(:disabled) > span')].find(x=>x.textContent.trim()===${JSON.stringify(label)});if(!n)return false;n.closest('button').click();return true})()`);
}
async function auditRoleWorkspace(cdp,role){
 await cdp.viewport(1440);
 const labels=await cdp.eval('[...document.querySelectorAll(".sidenav .nav-item:not(:disabled) > span")].map(n=>n.textContent.trim())');
 assert.deepEqual(labels.slice().sort(),ROLE_NAVIGATION[role].slice().sort(),`Visible menu differs from approved scope for ${role}`);
 const locked=await cdp.eval('[...document.querySelectorAll(".sidenav .aurel-locked-feature")].map(x=>({disabled:x.disabled,text:x.textContent.trim()}))');
 assert.equal(locked.length,role==='viewer'?1:0,`Unexpected locked operations for ${role}`);
 if(role==='viewer')assert.ok(locked[0].disabled&&locked[0].text.includes('Tài sản của tôi'),'Only unverified ownership may show a disabled viewer control');
 // Visit EVERY permitted destination, not only the dashboard; no click may
 // silently leave an empty page, crash React or expand the document horizontally.
 for(const [pageIndex,label] of ROLE_NAVIGATION[role].entries()){
  assert.ok(await clickNavigationLabel(cdp,label),`${role}: cannot open ${label}`);
  await cdp.until(`(()=>{const x=document.querySelector('.sidenav .nav-item[aria-current="page"] > span');return x?.textContent.trim()===${JSON.stringify(label)} && document.querySelector('.content-wrap')?.children.length>1})()`,`${role} page ${label}`);
  await checkLayout(cdp,1440);
  assert.equal(cdp.errors.length,0,`${role} page ${label}: ${cdp.errors.join(' | ')}`);
  await screenshot(cdp,`ROLE_${role.toUpperCase()}_PAGE_${String(pageIndex+1).padStart(2,'0')}`);
 }
 await screenshot(cdp,`ROLE_${role.toUpperCase()}_1440`);
 // At 390px the navigation is a modal overlay: opening it removes inert,
 // selecting a valid page closes it and restores the accessible workspace.
 await cdp.viewport(390);await pause(130);await checkLayout(cdp,390);
 assert.ok(await cdp.eval(`(()=>{const b=document.querySelector('button[aria-label="Mở danh mục điều hướng"]');if(!b||b.disabled)return false;b.click();return true})()`),`${role}: mobile menu toggle missing`);
 await cdp.until('Boolean(document.querySelector("#aurel-sidebar.mobile-open[role=dialog]:not([inert])"))',`${role} accessible mobile menu`);
 await checkLayout(cdp,390);await screenshot(cdp,`ROLE_${role.toUpperCase()}_MOBILE_MENU`);
 assert.ok(await clickNavigationLabel(cdp,'Danh mục căn hộ'),`${role}: mobile catalog inaccessible`);
 await cdp.until('!document.querySelector("#aurel-sidebar.mobile-open") && Boolean(document.querySelector("#aurel-sidebar[inert]"))',`${role} mobile menu closed after navigation`);
 await checkLayout(cdp,390);await screenshot(cdp,`ROLE_${role.toUpperCase()}_390`);
 // Keyboard-only mobile navigation: Escape must dismiss the modal without
 // changing the active page or leaving the content inert behind it.
 assert.ok(await cdp.eval(`(()=>{const b=document.querySelector('button[aria-label="Mở danh mục điều hướng"]');if(!b)return false;b.click();return true})()`),`${role}: cannot reopen mobile navigation`);
 await cdp.until('Boolean(document.querySelector("#aurel-sidebar.mobile-open[role=dialog]"))',`${role} menu reopened`);
 await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await cdp.until('!document.querySelector("#aurel-sidebar.mobile-open")',`${role} mobile Escape dismissal`);
 assert.equal(await cdp.eval('document.querySelector("#aurel-sidebar")?.hasAttribute("inert")'),true,`${role}: closed menu must be inert`);
 // Include typical compact and tablet viewport widths for every role, not
 // just the administrator; these are scripted checks, not real-device proof.
 for(const width of [375,430,768,1024]){await cdp.viewport(width);await pause(75);await checkLayout(cdp,width)}
 assert.equal(cdp.errors.length,0,`${role} mobile React error: ${cdp.errors.join(' | ')}`);
 await cdp.viewport(1440);
}
async function auditImmediateLogout(cdp,unitCode){
 // Hold only the logout fetch in this isolated browser. While the backend has
 // not yet received logout, the private React workspace must already be gone.
 const armed=await cdp.eval(`(()=>{const native=window.fetch.bind(window);let queued=null;
  window.fetch=(input,options)=>{if(String(input).endsWith('/api/auth/logout'))return new Promise((resolve,reject)=>{queued={input,options,resolve,reject}});return native(input,options)};
  window.__aurelQaReleaseLogout=()=>{if(!queued)return false;const item=queued;queued=null;native(item.input,item.options).then(item.resolve,item.reject);return true};return true})()`);
 assert.ok(armed,'Could not hold test-only logout request');
 assert.ok(await cdp.eval('(()=>{const button=document.querySelector(".aurel-account-trigger");if(!button)return false;button.click();return true})()'),'Account menu trigger missing');
 await cdp.until('Boolean(document.querySelector("[role=menuitem]"))','account menu opened');
 assert.ok(await cdp.clickByText('[role=menuitem]','Đăng xuất'),'Logout action missing');
 await cdp.until('typeof window.__aurelQaReleaseLogout==="function" && Boolean(document.querySelector(".aurel-auth-submit[disabled]"))','private UI immediately quarantined while logout is pending');
 assert.equal(await cdp.eval('Boolean(document.querySelector(".app-shell,.sidenav,.content-wrap"))'),false,'Private workspace remained mounted during pending logout');
 assert.equal(await cdp.eval(`document.body.textContent.includes(${JSON.stringify(unitCode)})`),false,'Private apartment code remained on screen after logout click');
 assert.equal((await browserApi(cdp,'/auth/me')).status,200,'Test must hold logout before server session revocation');
 assert.equal(await cdp.eval('window.__aurelQaReleaseLogout()'),true,'Held logout was not sent');
 await cdp.until('Boolean(document.querySelector(".aurel-auth-submit:not([disabled])"))','logout response completed');
 assert.equal((await browserApi(cdp,'/auth/me')).status,401,'Server did not revoke the session after UI quarantine');
}
// V2.70: real React UI → Express → isolated JSON acceptance for the owner workflow.
// This intentionally uses the visible registration form, owner proposal form and
// manager approval button; API calls only arrange the admin-controlled test fixture.
async function browserOwnerJourney(cdp,url,adminPassword,unitId){
 await loginAs(cdp,url,'admin',adminPassword);
 const adminMe=await browserApi(cdp,'/auth/me');
 const ownerClient=await browserApi(cdp,'/clients',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':adminMe.body.csrf},body:JSON.stringify({name:'QA Verified Owner',type:'owner'})});
 assert.equal(ownerClient.status,201,'Admin must create isolated owner fixture');
 const beforeLink=await browserApi(cdp,'/state');
 const draft=beforeLink.body.units.find(u=>u.id===unitId);
 const assigned=await browserApi(cdp,'/units/'+encodeURIComponent(unitId),{method:'PATCH',headers:{'Content-Type':'application/json','X-CSRF-Token':adminMe.body.csrf},body:JSON.stringify({expectedRevision:draft.revision,ownerId:ownerClient.body.id})});
 assert.equal(assigned.status,200,'Admin must assign owner to existing QA apartment');
 const adminOut=await browserApi(cdp,'/auth/logout',{method:'POST',headers:{'X-CSRF-Token':adminMe.body.csrf}});
 assert.equal(adminOut.status,200);
 // Self-registration must create the session without asking admin for approval.
 await cdp.navigate(url);
 await cdp.until('Boolean(document.querySelector(".aurel-auth-submit"))','React registration entry');
 assert.ok(await cdp.clickByText('.aurel-auth-switch button','Đăng ký tài khoản'),'Registration switch is missing');
 await cdp.until('Boolean(document.querySelector("input[autocomplete=name]"))','registration fields');
 const signupPassword='OwnerBrowser-QA-2026!';
 await cdp.textInput('input[autocomplete="name"]','QA Property Owner');
 await cdp.textInput('input[autocomplete="username"]','browserownerqa');
 const pwIds=await cdp.eval('[...document.querySelectorAll("input[autocomplete=new-password]")].map(x=>x.id)');
 assert.equal(pwIds.length,2,'Registration must contain password and confirmation');
 await cdp.textInput(`[id=${JSON.stringify(pwIds[0])}]`,signupPassword);
 await cdp.textInput(`[id=${JSON.stringify(pwIds[1])}]`,signupPassword);
 assert.ok(await cdp.clickByText('.aurel-auth-submit','Tạo tài khoản & vào AUREL'),'Registration submit not found');
 await cdp.until('Boolean(document.querySelector(".app-shell .content-wrap"))','auto-login after registration');
 const ownerMe=await browserApi(cdp,'/auth/me');
 assert.equal(ownerMe.status,200,'Registered owner must receive valid session');
 assert.equal(ownerMe.body.user.role,'viewer','Registered user role must be viewer');
 assert.equal(ownerMe.body.user.ownedUnitCount,0,'Ownership must not be self-proclaimed');
 const privateMenus=['Khoản thu & công nợ','Tiền cọc & hoàn cọc','Cài đặt & phân quyền','Nhân viên & phân công','Báo cáo điều hành','Nhật ký thay đổi'];
 const navTexts=await cdp.eval('[...document.querySelectorAll(".sidenav .nav-item:not([disabled])")].map(x=>x.textContent.trim())');
 for(const item of privateMenus)assert.ok(!navTexts.some(x=>x.includes(item)),'Viewer menu exposed internal feature '+item);
 assert.ok(!navTexts.some(x=>x.includes('Tài sản của tôi')),'Unverified owner must not receive unlocked private-property navigation');
 const writeDenied=await browserApi(cdp,'/units',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':ownerMe.body.csrf},body:JSON.stringify({code:'OWNER-ESCALATION'})});
 assert.equal(writeDenied.status,403,'Registered viewer must not create internal property records');
 await cdp.navigate(url);
 await cdp.until('Boolean(document.querySelector(".app-shell .content-wrap"))','signup cookie persists across reload');
 assert.equal((await browserApi(cdp,'/auth/me')).body.user.id,ownerMe.body.user.id,'Reload lost newly registered session');
 // Only an admin can verify an existing owner/client relationship.
 assert.equal((await browserApi(cdp,'/auth/logout',{method:'POST',headers:{'X-CSRF-Token':ownerMe.body.csrf}})).status,200);
 await loginAs(cdp,url,'admin',adminPassword);
 const renewedAdmin=await browserApi(cdp,'/auth/me');
 const link=await browserApi(cdp,'/auth/users/'+ownerMe.body.user.id+'/owner-clients/'+ownerClient.body.id,{method:'PUT',headers:{'X-CSRF-Token':renewedAdmin.body.csrf}});
 assert.equal(link.status,200,'Administrator failed to verify ownership');
 assert.equal((await browserApi(cdp,'/auth/logout',{method:'POST',headers:{'X-CSRF-Token':renewedAdmin.body.csrf}})).status,200);
 await loginAs(cdp,url,'browserownerqa',signupPassword);
 assert.ok(await cdp.clickByText('.sidenav .nav-item','Tài sản của tôi'),'Verified owner navigation was not unlocked');
 await cdp.until('Boolean(document.querySelector(".aurel-owned-asset-page .aurel-owner-correction"))','verified owner page');
 await screenshot(cdp,'VERIFIED_OWNER');
 await cdp.viewport(390);await pause(150);await checkLayout(cdp,390);await screenshot(cdp,'OWNER_MOBILE_390');
 await cdp.viewport(1440);
 assert.ok(await cdp.eval('(()=>{const details=document.querySelector(".aurel-owned-asset-page .aurel-owner-correction");if(!details)return false;details.open=true;return !!details.querySelector("form")})()'),'Owner proposal form is unavailable');
 assert.equal(await cdp.eval('document.querySelector(".aurel-owner-correction form button[type=submit]")?.disabled'),true,'Unchanged proposal must not be submitted');
 assert.ok(await cdp.eval('Boolean(document.querySelector(".aurel-owner-correction .aurel-proposal-current"))'),'Owner proposal lacks stored-value comparison');
 const newAddress='AUREL QA · địa chỉ đã xác minh';
 await cdp.textInput('.aurel-owned-asset-page .aurel-owner-correction form input',newAddress);
 assert.equal(await cdp.eval('document.querySelector(".aurel-owner-correction form button[type=submit]")?.disabled'),true,'A proposal without a reason should not be submitted');
 await cdp.textInput('.aurel-owned-asset-page .aurel-owner-correction form textarea' ,'Xác minh thông tin địa chỉ trên tài sản');
 assert.ok(await cdp.eval('(()=>{const b=document.querySelector(".aurel-owned-asset-page .aurel-owner-correction form button[type=submit]");if(!b||b.disabled)return false;b.click();return true})()'),'Owner form submit failed');
 await cdp.until('Boolean(document.querySelector(".aurel-owned-asset-page .aurel-owner-correction [role=status]"))','owner proposal pending state');
 const requests=await browserApi(cdp,'/me/owned-unit-change-requests');
 assert.equal(requests.status,200);
 const pending=requests.body.find(r=>r.unitId===unitId&&r.status==='pending');
 assert.ok(pending,'React owner form failed to save a pending request');
 assert.equal((await browserApi(cdp,'/me/owned-units')).body[0].address,draft.address||'','Owner submission must not edit the official unit');
 const ownerSession2=await browserApi(cdp,'/auth/me');
 assert.equal((await browserApi(cdp,'/auth/logout',{method:'POST',headers:{'X-CSRF-Token':ownerSession2.body.csrf}})).status,200);
 await loginAs(cdp,url,'qa_manager','Aurel-QA-manager-2026!');
 assert.ok(await cdp.clickByText('.sidenav .nav-item','Danh mục căn hộ'),'Manager catalog navigation missing');
 await cdp.until('Boolean(document.querySelector(".aurel-owner-correction-inbox"))','manager owner-proposal inbox');
 await cdp.eval('document.querySelector(".aurel-owner-correction-inbox").open=true');
 await cdp.until('Boolean(document.querySelector(".aurel-owner-correction-inbox .aurel-owned-asset-card"))','manager sees pending request');
 await screenshot(cdp,'MANAGER_OWNER_INBOX');
 assert.ok(await cdp.clickByText('.aurel-owner-correction-inbox .aurel-owner-review-actions button','Duyệt cập nhật'),'Manager approval button missing');
 await cdp.until('Boolean(document.querySelector(".aurel-confirm[role=alertdialog]"))','approval confirmation dialog');
 const reviewFacts=await cdp.eval('[...document.querySelectorAll(".aurel-confirm .aurel-confirm-facts dd")].map(x=>x.textContent.trim())');
 assert.ok(reviewFacts.includes(newAddress),'Manager confirmation does not show the proposed value');
 // Cancel must leave the original request pending and the official record untouched.
 assert.ok(await cdp.clickByText('.aurel-confirm .confirm-actions button','Quay lại'),'Manager confirmation cancel is missing');
 await cdp.until('!document.querySelector(".aurel-confirm[role=alertdialog]")','approval confirmation canceled');
 assert.equal((await browserApi(cdp,'/owner-change-requests')).body.some(r=>r.id===pending.id),true,'Cancel unexpectedly processed owner request');
 assert.equal((await browserApi(cdp,'/state')).body.units.find(u=>u.id===unitId)?.address,draft.address||'','Cancel must not edit property');
 assert.ok(await cdp.clickByText('.aurel-owner-correction-inbox .aurel-owner-review-actions button','Duyệt cập nhật'),'Manager repeat approval button missing');
 await cdp.until('Boolean(document.querySelector(".aurel-confirm[role=alertdialog]"))','review after cancel');
 assert.ok(await cdp.clickByText('.aurel-confirm .confirm-actions button','Xác nhận duyệt'),'Manager final approval confirmation missing');
 await cdp.until('!document.querySelector(".aurel-owner-correction-inbox .aurel-owned-asset-card")','manager approval applied and inbox refreshed');
 const managerState=await browserApi(cdp,'/state');
 const changed=managerState.body.units.find(u=>u.id===unitId);
 assert.equal(changed.address,newAddress,'Real manager React click did not persist approved address');
 assert.equal(changed.ownerId,ownerClient.body.id,'Owner approval changed ownership unexpectedly');
 const managerSession=await browserApi(cdp,'/auth/me');
 assert.equal((await browserApi(cdp,'/auth/logout',{method:'POST',headers:{'X-CSRF-Token':managerSession.body.csrf}})).status,200);
 await loginAs(cdp,url,'browserownerqa',signupPassword);
 assert.equal((await browserApi(cdp,'/me/owned-units')).body[0].address,newAddress,'Owner does not see manager-approved address');
 const ownerDone=await browserApi(cdp,'/me/owned-unit-change-requests');
 assert.equal(ownerDone.body.find(r=>r.id===pending.id)?.status,'approved','Owner sees wrong approval status');
 const afterSession=await browserApi(cdp,'/auth/me');
 await browserApi(cdp,'/auth/logout',{method:'POST',headers:{'X-CSRF-Token':afterSession.body.csrf}});
 await loginAs(cdp,url,'admin',adminPassword);
 const finalAdmin=await browserApi(cdp,'/auth/me');
 assert.equal((await browserApi(cdp,'/auth/users/'+ownerMe.body.user.id+'/owner-clients/'+ownerClient.body.id,{method:'DELETE',headers:{'X-CSRF-Token':finalAdmin.body.csrf}})).status,200,'Admin revocation failed');
 assert.equal((await browserApi(cdp,'/auth/logout',{method:'POST',headers:{'X-CSRF-Token':finalAdmin.body.csrf}})).status,200);
 await loginAs(cdp,url,'browserownerqa',signupPassword);
 assert.deepEqual((await browserApi(cdp,'/me/owned-units')).body,[],'Revoked owner still reads private unit');
 assert.equal(await cdp.eval('[...document.querySelectorAll(".sidenav .nav-item:not([disabled])")].some(x=>x.textContent.includes("Tài sản của tôi"))'),false,'Revoked owner navigation remains unlocked');
 const finalOwner=await browserApi(cdp,'/auth/me');
 await browserApi(cdp,'/auth/logout',{method:'POST',headers:{'X-CSRF-Token':finalOwner.body.csrf}});
 console.log('PASS live owner React: register→auto-login→reload→viewer isolation→admin verify→owner submit→manager approve→revoke');
}
async function liveRun(cdp){
 workspace=await mkdtemp(path.join(tmpdir(),'aurel-json-'));
 const port=await ephemeralPort(),webPort=await ephemeralPort();const pwd='LocalOnly-React-QA-2026!';
 const environment={...process.env,PORT:String(port),AUREL_STORAGE:'json',AUREL_DEMO_DATA_DIR:workspace,DEMO_ADMIN_PASSWORD:pwd, AUREL_API_PROXY_TARGET:`http://127.0.0.1:${port}`,NODE_ENV:'development'};
 const api=start(process.execPath,['backend/src/index.js'],{env:environment});await waitFor(`http://127.0.0.1:${port}/api/ready`).catch(()=>{throw Error('JSON test backend failed: '+api.log)});
 const cmd=process.platform==='win32'?'npm.cmd':'npm';const vite=start(cmd,['run','dev','-w','frontend','--','--host','127.0.0.1','--port',String(webPort),'--strictPort'],{env:environment,shell:process.platform==='win32'});
 const url=`http://127.0.0.1:${webPort}/`;await waitFor(url).catch(()=>{throw Error('Vite development server failed: '+vite.log)});
 await cdp.viewport(1440);await cdp.navigate(url);
 await cdp.until('Boolean(document.querySelector(".aurel-auth-submit"))','React login form');await checkLayout(cdp,1440);
 // The login surface is part of UAT too, not only the authenticated workspace.
 for(const width of [320,390]){await cdp.viewport(width);await pause(150);await checkLayout(cdp,width)}
 await cdp.viewport(1440);
 await cdp.textInput('input[autocomplete="username"]','admin');await cdp.textInput('input[autocomplete="current-password"]',pwd);
 assert.ok(await cdp.clickByText('.aurel-auth-submit','Đăng nhập'),'Login submit missing');
 await cdp.until('Boolean(document.querySelector(".app-shell .content-wrap"))','React authenticated dashboard');await checkLayout(cdp,1440);await screenshot(cdp,'DESKTOP_1440');
 assert.ok(await cdp.clickByText('.sidenav .nav-item','Danh mục căn hộ'),'Unit catalog navigation missing');
 await cdp.until('Boolean(document.querySelector(".page-header h1")?.textContent.includes("Danh mục căn hộ"))','Unit catalog');
 assert.ok(await cdp.clickByText('.page-actions button','Thêm căn hộ'),'Add-unit button missing');
 await cdp.until('Boolean(document.querySelector(".editor[role=dialog]"))','Create unit editor');
 const code='BROWSER-QA-DRAFT';await fillLabeledField(cdp,'Mã căn',code);
 await fillLabeledField(cdp,'Diện tích (m²)','64.5');
 await fillLabeledField(cdp,'Số phòng ngủ','2');
 const saveButton=await cdp.eval(`(()=>{const form=document.querySelector('.editor[role=dialog] form');const btn=form?.querySelector('button[type=submit]');if(!btn)return null;btn.click();return btn.textContent.trim()})()`);
 assert.ok(saveButton,'Unit form submit missing');await cdp.until('!document.querySelector(".editor[role=dialog]")','Unit saved and editor closed');
 // This is a real Vite -> Express -> isolated JSON API read after the React form submitted.
 const saved=await cdp.eval(`fetch('/api/state',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(d=>d?.units?.find(u=>u.code===${JSON.stringify(code)})||null)`);
 assert.ok(saved?.id,'React form did not persist the new apartment via backend');
 assert.equal(Number(saved.area),64.5,'Area must survive React -> Express');
 assert.equal(Number(saved.bedrooms),2,'Bedrooms must survive React -> Express');
 // A browser refresh alone could pass from an in-memory server cache. Verify
 // the exact record was durably written to the disposable JSON file as well.
 const persisted=JSON.parse(await readFile(path.join(workspace,'local-demo.json'),'utf8'));
 assert.equal(persisted.units.find(u=>u.code===code)?.id,saved.id,'Apartment was not committed to the isolated storage file');
 await cdp.navigate(url);await cdp.until('Boolean(document.querySelector(".app-shell .content-wrap"))','React after reload');
 const restored=await cdp.eval(`fetch('/api/state',{credentials:'same-origin'}).then(r=>r.json()).then(d=>d.units.find(u=>u.code===${JSON.stringify(code)})||null)`);
 assert.equal(restored?.id,saved.id,'Apartment missing after reloading workspace');
 assert.equal(restored?.code,persisted.units.find(u=>u.id===saved.id)?.code,'Reloaded browser differs from on-disk unit');
 // From the visible unit catalog, open the real dossier and update the record
 // using the existing React editor, not an HTTP patch shortcut.
 assert.ok(await cdp.clickByText('.sidenav .nav-item','Danh mục căn hộ'),'Catalog navigation missing after reload');
 await cdp.until('Boolean(document.querySelector(".page-header h1")?.textContent.includes("Danh mục căn hộ"))','catalog after reload');
 assert.ok(await cdp.eval(`(()=>{let n=document.querySelector(${JSON.stringify('button[aria-label="Xem căn '+code+'"]')});if(!n)return false;n.click();return true})()`),'Created unit not visible in catalog');
 await cdp.until('Boolean(document.querySelector(".v09-dossier[role=dialog]"))','real unit dossier');
 assert.ok(await cdp.clickByText('.v09-dossier-actions button','Sửa thông tin'),'Edit-unit action missing in dossier');
 await cdp.until('Boolean(document.querySelector(".editor[role=dialog]"))','edit-unit editor');
 // A synthetic cancelable event verifies the mounted React listener without
 // triggering a native dialog that would interrupt the remainder of this UAT.
 const unloadProtected=()=>cdp.eval(`(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented})()`);
 assert.equal(await unloadProtected(),false,'Untouched editor must not block page departure');
 assert.equal(await cdp.eval('document.querySelector(".editor form button[type=submit]").disabled'),true,'Unchanged editor save must be disabled');
 await fillLabeledField(cdp,'Ghi chú nội thất','Bản nháp chưa lưu');
 await cdp.until(`(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented})()`,'unsaved work navigation guard');
 await fillLabeledField(cdp,'Ghi chú nội thất',saved.interiorNotes||'');
 await cdp.until('document.querySelector(".editor form button[type=submit]").disabled','reverted draft is clean');
 assert.equal(await unloadProtected(),false,'Reverted editor must release navigation guard');
 for(const width of [375,390,430,768,1024,1440]){await cdp.viewport(width);await pause(100);await checkLayout(cdp,width)}
 await fillLabeledField(cdp,'Ghi chú nội thất','Đã kiểm chứng từ biểu mẫu React');
 await fillLabeledField(cdp,'Giá thuê tham khảo (VND)','9500000');
 assert.ok(await cdp.eval(`(()=>{let button=document.querySelector('.editor form button[type="submit"]');if(!button)return false;button.click();return true})()`),'Edit form submit missing');
 await cdp.until('!document.querySelector(".editor[role=dialog]")','edit saved and editor closed');
 assert.equal(await unloadProtected(),false,'Successful save must remove the unload listener');
 const edited=await browserApi(cdp,'/state');
 assert.equal(edited.status,200,'Authorized read after edit failed');
 const editedUnit=edited.body?.units?.find(u=>u.id===saved.id);
 assert.equal(editedUnit?.interiorNotes,'Đã kiểm chứng từ biểu mẫu React');
 assert.equal(Number(editedUnit?.rent),9500000);
 const diskAfterEdit=JSON.parse(await readFile(path.join(workspace,'local-demo.json'),'utf8'));
 assert.equal(diskAfterEdit.units.find(u=>u.id===saved.id)?.interiorNotes,editedUnit.interiorNotes,'Edited notes not durable on disk');
 assert.equal(Number(diskAfterEdit.units.find(u=>u.id===saved.id)?.rent),9500000,'Edited rent not durable on disk');
 await cdp.navigate(url);
 await cdp.until('Boolean(document.querySelector(".app-shell .content-wrap"))','workspace reloaded after edit');
 const afterEditReload=await browserApi(cdp,'/state');
 assert.equal(afterEditReload.body?.units?.find(u=>u.id===saved.id)?.interiorNotes,editedUnit.interiorNotes,'Edited notes missing after reload');
 // Create test-only roles through the authenticated admin API. Check actual
 // server-side 403 responses as well as the UI, not merely hidden buttons.
 const session=await browserApi(cdp,'/auth/me');
 assert.equal(session.status,200,'Admin session must be valid');
 const csrf=session.body.csrf;
 // The write route must reject a browser request with a valid admin cookie
 // but no CSRF header; checking only unauthenticated writes would miss this.
 const missingCsrf=await browserApi(cdp,'/units',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'NO-CSRF-QA'})});
 assert.equal(missingCsrf.status,403,'Authenticated write without CSRF must be rejected');
 const afterCsrf=await browserApi(cdp,'/state');
 assert.ok(!afterCsrf.body.units.some(u=>u.code==='NO-CSRF-QA'),'Rejected write must not persist a unit');
 const roles=['manager','accountant','staff','viewer'];
 for(const role of roles){
  const password=`Aurel-QA-${role}-2026!`;
  const created=await browserApi(cdp,'/auth/users',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({username:'qa_'+role,password,role,name:'QA '+role})});
  assert.equal(created.status,201,`Admin could not create isolated ${role} test account`);
 }
 const logout=await browserApi(cdp,'/auth/logout',{method:'POST',headers:{'X-CSRF-Token':csrf}});
 assert.equal(logout.status,200,'Logout must invalidate admin cookie');
 for(const role of roles){
  const password=`Aurel-QA-${role}-2026!`;
  await loginAs(cdp,url,'qa_'+role,password);
  const me=await browserApi(cdp,'/auth/me');
  assert.equal(me.body?.user?.role,role,`Wrong authenticated role for ${role}`);
  const state=await browserApi(cdp,'/state');
  assert.equal(state.status,200,`/api/state denied ${role}`);
  if(role==='viewer'){
   assert.deepEqual(state.body?.payments,[],'Viewer must not receive payment records');
   assert.deepEqual(state.body?.clients,[],'Viewer must not receive customer PII');
   assert.equal(state.body?.units?.find(u=>u.id===saved.id)?.rent,null,'Viewer must not receive apartment rent');
  }
  if(role==='staff')assert.deepEqual(state.body?.units,[],'Unassigned staff must see no units');
  if(role!=='manager'){
   assert.equal(await cdp.eval(`(()=>![...document.querySelectorAll('.page-actions button,.sidenav button')].some(b=>b.textContent.includes('Thêm căn hộ')) )()`),true,`${role} must not see unit creation`);
   const denied=await browserApi(cdp,'/units',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':me.body.csrf},body:JSON.stringify({code:'FORBIDDEN-'+role})});
   assert.equal(denied.status,403,`${role} must be forbidden from creating apartments`);
  }
  await auditRoleWorkspace(cdp,role);
  const out=await browserApi(cdp,'/auth/logout',{method:'POST',headers:{'X-CSRF-Token':me.body.csrf}});
  assert.equal(out.status,200,`Logout failed for ${role}`);
  const afterLogout=await browserApi(cdp,'/auth/me');
  assert.equal(afterLogout.status,401,`${role} session still authenticated after logout`);
  const deniedState=await browserApi(cdp,'/state');
  assert.equal(deniedState.status,401,`${role} can still fetch protected data after logout`);
 }
 await browserOwnerJourney(cdp,url,pwd,saved.id);
 await loginAs(cdp,url,'admin',pwd);
 for(const width of [320,390,768,1024,1440,1920,2560]){await cdp.viewport(width);await pause(120);await checkLayout(cdp,width)}
 await cdp.viewport(390);await cdp.navigate(url);await cdp.until('Boolean(document.querySelector(".app-shell .content-wrap"))','React mobile workspace');await checkLayout(cdp,390);
 assert.ok(await cdp.eval(`(()=>{let b=document.querySelector('button[aria-label="Mở danh mục điều hướng"]');if(!b)return false;b.click();return true})()`),'Mobile navigation trigger missing');
 await cdp.until('Boolean(document.querySelector("#aurel-sidebar.mobile-open"))','Mobile sidebar opened');
 assert.ok(await cdp.clickByText('.sidenav .nav-item','Danh mục căn hộ'),'Mobile unit navigation missing');await cdp.until('Boolean(document.querySelector(".page-header h1")?.textContent.includes("Danh mục căn hộ"))','Mobile unit catalog');
 await checkLayout(cdp,390);await screenshot(cdp,'MOBILE_390');
 await cdp.viewport(1440);await auditImmediateLogout(cdp,code);
 assert.equal(cdp.errors.length,0,'Browser runtime exception: '+cdp.errors.join(' | '));
 console.log('PASS REAL React/Chromium + Express disposable JSON: create/edit/reload, 5 role-specific navigation contracts, immediate logout quarantine, owner verification/proposal/approval/revocation, responsive and logo. PostgreSQL and real-device UAT NOT RUN.');
}
// Fail before launching Chromium if we cannot run the actual React application.
// The CDP-only driver mode still works without installing frontend/backend packages.
function coreBrowserDependencies(){
 const realms=[['frontend',['react','react-dom','vite']],['backend',['express']]];
 return realms.flatMap(([folder,modules])=>{
  const req=createRequire(path.join(root,folder,'package.json'));
  return modules.filter(name=>{try{req.resolve(name);return false}catch{return true}}).map(name=>folder+'/'+name);
 });
}
let cdp;try{
 if(!driverCheck){const missing=coreBrowserDependencies();if(missing.length)throw Error('React integration NOT RUN: dependencies missing: '+missing.join(', ')+'. Run npm install where Internet access is available.');}
 cdp=await connectChrome();if(driverCheck){
 await cdp.viewport(390);
 // Driver-only checks use Page.setDocumentContent: some QA sandboxes forbid
 // navigation to data: and localhost URLs, even when Chromium itself works.
 const frame=(await cdp.send('Page.getFrameTree')).frameTree.frame.id;
 const html='<!doctype html><title>AUREL QA</title><input id="rent" type="number" value="2500000"><input id="name" value="Old"><script>window.testInputEvents=0;document.addEventListener("input",()=>window.testInputEvents++)<\/script>';
 await cdp.send('Page.setDocumentContent',{frameId:frame,html});
 await cdp.until('!!document.querySelector("#rent")','driver test document');
 await cdp.textInput('#rent','9500000');
 await cdp.textInput('#name','New');
 assert.deepEqual(await cdp.eval('({rent:document.querySelector("#rent").value,name:document.querySelector("#name").value,events:window.testInputEvents})'),{rent:'9500000',name:'New',events:2},'CDP replacement must dispatch real input events, including numeric fields');
 // A new browser document has no state from the previous document.
 // Browser navigation is exercised in liveRun when local URL navigation is permitted.
 console.log('PASS Chromium CDP driver: input replacement + real input events. React / Express / PostgreSQL NOT RUN.');
}else await liveRun(cdp)}catch(error){
 console.error('NOT ACCEPTED:',error.message);process.exitCode=driverCheck?1:2;
 if(cdp&&!driverCheck&&workspace&&process.env.AUREL_QA_OUTPUT_DIR){
  try{await screenshot(cdp,'FAILURE_CONTEXT');console.error('QA-only failure screenshot saved in:',path.resolve(process.env.AUREL_QA_OUTPUT_DIR))}
  catch(captureError){console.error('Could not capture QA screenshot:',captureError.message)}
 }
}finally{cdp?.close();for(const p of children){p.kill('SIGTERM');await Promise.race([new Promise(r=>p.once('exit',r)),pause(500)])}if(profile)await rm(profile,{force:true,recursive:true,maxRetries:3,retryDelay:50}).catch(()=>{});if(workspace)await rm(workspace,{force:true,recursive:true}).catch(()=>{})}
