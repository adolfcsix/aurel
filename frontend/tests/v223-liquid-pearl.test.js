import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../src/',import.meta.url);
const read=file=>readFileSync(new URL(file,root),'utf8');

test('V2.23: Liquid Pearl is imported as the last finishing layer',()=>{
 const main=read('main.jsx');
 assert.match(main,/import '\.\/atelier-v222\.css';\s*import '\.\/atelier-v223\.css';/);
});
test('V2.23: tactile finish is opt-in and excludes destructive / form submit buttons',()=>{
 const ui=read('components/Ui.jsx');
 assert.match(ui,/finish='standard'/);
 assert.match(ui,/finish==='pearl'&&type==='button'&&!\['danger','dangerGhost'\]\.includes\(kind\)/);
 assert.match(ui,/pearl\?' aurel-pearl-control'/);
});
test('V2.23: navigation affordances opt into the finish but financial commits do not',()=>{
 const overview=read('components/ExecutiveOverview.jsx');
 const app=read('App.jsx');
 const lease=read('components/LeaseAttentionDesk.jsx');
 const approval=read('components/ApprovalWorkbench.jsx');
 assert.match(overview,/atelier-button-dark aurel-pearl-control/);
 assert.match(app,/top-search aurel-top-search aurel-pearl-control/);
 assert.match(lease,/finish="pearl" onClick=\{\(\)=>onOpen\(lease\)\}/);
 assert.match(approval,/finish="pearl" onClick=\{\(\)=>setVisibleCount/);
 assert.doesNotMatch(approval,/<Btn[^>]*finish="pearl"[^>]*on(?:Approve|Execute|Reject)/);
 assert.doesNotMatch(app,/<Btn[^>]*finish="pearl"[^>]*onClick=\{\(\)=>\{setVerificationRequired/);
});
test('V2.23: finish is lightweight, keyboard visible, motion-safe, and touch-safe',()=>{
 const css=read('atelier-v223.css');
 for(const pattern of [/aurel-pearl-control/,/focus-visible/,/prefers-reduced-motion/,/hover:none/,/pointer-events:none/,/translateY\(-1px\)/])assert.match(css,pattern);
 assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g,''),/@keyframes|backdrop-filter|filter:\s*blur/);
});
test('V2.23: CSS scopes pearl styling and does not globally round all buttons',()=>{
 const css=read('atelier-v223.css');
 assert.match(css,/\.btn\.primary\.aurel-pearl-control/);
 assert.match(css,/\.btn\.outline\.aurel-pearl-control/);
 assert.match(css,/\.top-search\.aurel-top-search\.aurel-pearl-control/);
 assert.doesNotMatch(css,/(^|\n)\s*\.btn\s*\{\s*border-radius:999px/m);
});
