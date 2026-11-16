import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dialogFocusables,topmostModal,containModalTab} from '../src/lib/modal-focus.js';

const src = relative => readFileSync(fileURLToPath(new URL('../src/'+relative,import.meta.url)),'utf8');
function fixture(){
 const doc={activeElement:null,defaultView:{getComputedStyle:el=>({visibility:el.visibility||'visible'})},querySelectorAll:()=>modals};
 let modals=[];
 const makeControl = name=>({name,ownerDocument:doc,visibility:'visible',focus(){doc.activeElement=this},getClientRects:()=>[{}],hasAttribute:()=>false,matches:()=>false,getAttribute:()=>null,closest:()=>null});
 const makeDialog = (name,controls)=>({name,ownerDocument:doc,querySelectorAll:()=>controls,contains:el=>controls.includes(el),focus(){doc.activeElement=this}});
 return {doc,makeControl,makeDialog,setModals:xs=>{modals=xs},event:(shiftKey=false)=>({key:'Tab',shiftKey,prevented:false,preventDefault(){this.prevented=true}})};
}
test('v2.35 modal: alertdialog is included when selecting the uppermost overlay',()=>{
 const {doc,makeDialog,setModals}=fixture();
 const parent=makeDialog('editor',[]),confirmation=makeDialog('unsaved changes',[]);
 setModals([parent,confirmation]);
 assert.equal(topmostModal(parent),false);
 assert.equal(topmostModal(confirmation),true);
});
test('v2.35 modal: visual-hidden controls are excluded from the focus loop',()=>{
 const {makeControl,makeDialog}=fixture();
 const hidden=makeControl('hidden');hidden.visibility='hidden';
 const visible=makeControl('visible');
 assert.deepEqual(dialogFocusables(makeDialog('d',[hidden,visible])),[visible]);
});
test('v2.35 modal: descendant disabled fieldsets do not enter the focus loop',()=>{
 const {makeControl,makeDialog}=fixture();
 const disabled=makeControl('fieldset disabled');disabled.matches=sel=>sel===':disabled';
 const active=makeControl('active');
 assert.deepEqual(dialogFocusables(makeDialog('d',[disabled,active])),[active]);
});
test('v2.35 modal: a nested confirmation loops Tab inside itself, not the editor',()=>{
 const {doc,makeControl,makeDialog,setModals,event}=fixture();
 const editor=makeDialog('editor',[makeControl('field')]);
 const first=makeControl('cancel'),last=makeControl('confirm');
 const confirmation=makeDialog('confirmation',[first,last]);
 setModals([editor,confirmation]);doc.activeElement=last;
 assert.equal(topmostModal(editor),false);
 assert.equal(topmostModal(confirmation),true);
 const key=event();assert.equal(containModalTab(key,confirmation,first),true);
 assert.equal(key.prevented,true);assert.equal(doc.activeElement,first);
});
test('v2.35 modal: editor and verification panels share the same keyboard contract',()=>{
 const app=src('App.jsx');
 const decision=src('components/DecisionDialog.jsx');
 const closeLease=src('components/CloseLeaseDialog.jsx');
 for(const s of [app,decision,closeLease]){
  assert.match(s,/containModalTab\(/);
  assert.match(s,/topmostModal\(/);
  assert.match(s,/addEventListener\('focusin',/);
  assert.match(s,/removeEventListener\('focusin',/);
 }
 assert.match(app,/role="alertdialog"/);
 assert.match(app,/discardPrompt\?dialogRef\.current\?\.querySelector\('\.atelier-discard-panel'\)/);
});
test('v2.35 modal: critical close operation still requires preview and reason',()=>{
 const closeLease=src('components/CloseLeaseDialog.jsx');
 assert.match(closeLease,/reason\.trim\(\)\.length<5/);
 assert.match(closeLease,/writeLock\.current/);
 assert.match(closeLease,/const frozen=committed\|\|unknown/);
 assert.match(closeLease,/isOutcomeUncertain/);
});
test('v2.35 modal: no new luxury CSS layer is added for a keyboard safety fix',()=>{
 const main=src('main.jsx');
 assert.match(main,/import '\.\/atelier-v233\.css';/);
 assert.doesNotMatch(main,/atelier-v235\.css/);
});
test('v2.35 modal: full apartment dossier shares the same topmost dialog contract',()=>{
 const dossier=src('components/PropertyDossier.jsx');
 assert.match(dossier,/containModalTab\(/);
 assert.match(dossier,/topmostModal\(/);
 assert.match(dossier,/addEventListener\('focusin',/);
 assert.match(dossier,/removeEventListener\('focusin',/);
 assert.match(dossier,/tabIndex=\{-1\} role="dialog"/);
});
test('v2.35 modal: bulk update prevents closing while busy and double preview',()=>{
 const bulk=src('components/BulkUnitPanel.jsx');
 assert.match(bulk,/containModalTab\(/);
 assert.match(bulk,/topmostModal\(/);
 assert.match(bulk,/previewPending\.current/);
 assert.match(bulk,/if\(previewPending\.current\|\|busy\|\|locked\)return/);
 assert.match(bulk,/onClick=\{onClose\} disabled=\{busy\}/);
 assert.match(bulk,/const onKeyDown=event=>\{if\(!topmostModal\(dialogRef\.current\)\)return/);
});
