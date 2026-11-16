import test from 'node:test';
import assert from 'node:assert/strict';
import {dialogFocusables,topmostModal,containModalTab} from '../src/lib/modal-focus.js';

function fakeDialog(n=3){
 const doc={activeElement:null,querySelectorAll(){return dialogs}};
 let dialogs=[];
 const items=Array.from({length:n},(_,i)=>({
  name:'item'+i,rects:1,hidden:false,disabled:false,focus(){doc.activeElement=this},
  getClientRects(){return Array(this.rects).fill({})},
  hasAttribute(key){return key==='disabled'&&this.disabled},
  getAttribute(key){return key==='aria-hidden'&&this.hidden?'true':null},
  closest(){return null},
 }));
 const dialog={ownerDocument:doc,querySelectorAll(){return items},contains(item){return items.includes(item)}};
 dialogs=[dialog];
 const event=(shiftKey=false)=>({key:'Tab',shiftKey,prevented:false,preventDefault(){this.prevented=true}});
 return {dialog,doc,items,event,setDialogs:x=>dialogs=x};
}
test('v2.34: keyboard traversal wraps from final action to first',()=>{
 const {dialog,doc,items,event}=fakeDialog(); doc.activeElement=items[2];
 const e=event();assert.equal(containModalTab(e,dialog,items[0]),true);
 assert.equal(e.prevented,true);assert.equal(doc.activeElement,items[0]);
});
test('v2.34: reverse Tab wraps to final action without moving content',()=>{
 const {dialog,doc,items,event}=fakeDialog();doc.activeElement=items[0];
 const e=event(true);assert.equal(containModalTab(e,dialog,items[0]),true);
 assert.equal(doc.activeElement,items[2]);
});
test('v2.34: normal Tab leaves browser behavior intact',()=>{
 const {dialog,doc,items,event}=fakeDialog();doc.activeElement=items[1];
 const e=event();assert.equal(containModalTab(e,dialog,items[0]),false);
 assert.equal(e.prevented,false);assert.equal(doc.activeElement,items[1]);
});
test('v2.34: tabbing with focus outside the overlay returns inside',()=>{
 const {dialog,doc,items,event}=fakeDialog();doc.activeElement={};
 const e=event(true);assert.equal(containModalTab(e,dialog,items[0]),true);
 assert.equal(doc.activeElement,items[2]);
});
test('v2.34: only topmost modal has authority to reclaim focus',()=>{
 const {dialog,setDialogs}=fakeDialog();
 const another={ownerDocument:dialog.ownerDocument};setDialogs([dialog,another]);
 assert.equal(topmostModal(dialog),false);assert.equal(topmostModal(another),true);
});
test('v2.34: empty modal keeps focus on safe fallback',()=>{
 const {dialog,doc,event}=fakeDialog(0);
 let restored=false;const fallback={focus(){restored=true}};
 const e=event();assert.equal(containModalTab(e,dialog,fallback),true);
 assert.equal(restored,true);assert.equal(e.prevented,true);
});
test('v2.34: hidden or disabled controls do not enter focus order',()=>{
 const {dialog,items}=fakeDialog();items[0].hidden=true;items[1].rects=0;
 assert.deepEqual(dialogFocusables(dialog),[items[2]]);
});
test('v2.34: non-Tab keys are never intercepted',()=>{
 const {dialog,event}=fakeDialog();const e=event();e.key='ArrowDown';
 assert.equal(containModalTab(e,dialog,null),false);assert.equal(e.prevented,false);
});
test('v2.34: search and dossier use one shared focus contract',async()=>{
 const {readFileSync}=await import('node:fs');const {fileURLToPath}=await import('node:url');
 const base=fileURLToPath(new URL('../src/components/',import.meta.url));
 for(const file of ['PrivateSearch.jsx','DossierFrame.jsx']){
  const source=readFileSync(base+file,'utf8');
  assert.match(source,/containModalTab/);assert.match(source,/topmostModal/);
 }
 assert.match(readFileSync(base+'PrivateSearch.jsx','utf8'),/aria-live="polite"/);
});
