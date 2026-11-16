import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {actionIntent} from '../src/lib/action-presentation.js';
const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8');

test('v240 navigation identity is intentional, never inferred from Vietnamese labels',()=>{
 assert.equal(actionIntent({kind:'outline',intent:'navigate'}),'navigate');
 assert.equal(actionIntent({kind:'outline',icon:'arrowRight'}),'navigate');
 assert.equal(actionIntent({kind:'outline',icon:'building',intent:'standard'}),'standard');
 assert.equal(actionIntent({kind:'primary',icon:'edit'}),'standard');
 assert.equal(actionIntent({kind:'secondary',type:'submit',intent:'navigate'}),'standard');
});
test('v240 financial and irreversible controls never gain navigational flourish',()=>{
 for(const kind of ['danger','dangerGhost']){
  assert.equal(actionIntent({kind,icon:'arrowRight',intent:'navigate'}),'standard');
  assert.equal(actionIntent({kind,intent:'navigate'}),'standard');
 }
 const ui=read('components/Ui.jsx');
 assert.match(ui,/finish==='pearl'&&type==='button'&&!\['danger','dangerGhost'\]\.includes\(kind\)/);
 assert.match(ui,/aria-busy=\{busy\|\|undefined\}/);
 assert.match(ui,/disabled=\{disabled\|\|busy\}/);
});
test('v240 buttons keep authored text, separate icon position, and share one component',()=>{
 const ui=read('components/Ui.jsx');
 assert.match(ui,/className=\{'btn aurel-refined-action '/);
 assert.match(ui,/data-aurel-intent=\{navigation\?'navigate':'standard'\}/);
 assert.match(ui,/className="aurel-btn-leading" aria-hidden="true"/);
 assert.match(ui,/className="aurel-btn-copy"/);
 assert.match(ui,/className="aurel-btn-tail" aria-hidden="true"/);
 const catalog=read('components/SpatialCatalog.jsx');
 assert.match(catalog,/<Btn kind="outline" intent="navigate" icon="arrowRight"/);
 for(const f of ['ClientDossier','ProjectDossier','StaffDossier','LeaseDossier'])assert.match(read('components/'+f+'.jsx'),/intent="navigate" icon="arrowRight"/);
});
test('v240 button craftsmanship stays in last existing style without creating CSS accumulation',()=>{
 const entry=read('main.jsx'),css=read('atelier-v233.css');
 assert.match(entry,/import '\.\/atelier-v233\.css';/);
 assert.doesNotMatch(entry,/atelier-v240\.css/);
 assert.match(css,/V2\.40 — Maison Action Atelier/);
 assert.match(css,/\.btn\.aurel-refined-action \{/);
 assert.match(css,/min-height:46px/);
 assert.match(css,/border-radius:var\(--maison-action-radius\)!important/);
 assert.match(css,/\.aurel-btn-tail/);
 assert.match(css,/\.btn\.aurel-refined-action:is\(\.danger,\.dangerGhost\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/forced-colors:active/);
});
test('v240 menu and user-facing controls do not display keyboard tutorials',()=>{
 for(const f of ['components/DossierFrame.jsx','components/PrivateSearch.jsx','components/Ui.jsx']){
  assert.doesNotMatch(read(f),/Thử phím Tab|Nhấn Escape|Cách thử phím/);
 }
});
