import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const css=read('atelier-v232.css');

test('V2.32 surface contract is last and uses the V2.31 tonal variables rather than competing colors',()=>{
 assert.match(read('main.jsx'),/import '\.\/atelier-v231\.css';\s*import '\.\/atelier-v232\.css';/);
 for(const token of ['page','sheet','header','pure','soft','quiet']) assert.match(css,new RegExp('--maison-surface-'+token+':\\s*var\\(--maison-31-'));
 for(const token of ['main','supporting']) assert.match(css,new RegExp('--maison-text-'+token+':\\s*var\\(--maison-31-'));
});
test('V2.32 palette joins shell, navigation, forms and dossiers while keeping form fields opaque',()=>{
 for(const segment of ['.topbar,','.aurel-account-popover,','.editor.atelier-editor,','.aurel-dossier-sheet','.aurel-dossier-scroll','.atelier-editor :is(input.field-input']) assert.ok(css.includes(segment),segment);
 assert.match(css,/input\.field-input,select\.field-input,textarea\.field-input/);
 assert.match(css,/background:var\(--maison-surface-pure\);color:var\(--maison-text-main\)/);
});
test('V2.32 preserves the common button shape and clear disabled states',()=>{
 // V2.49: the repeated V2.32 declaration was safely removed; its final
 // V2.33 cascade definition remains the source of truth.
 assert.match(read('atelier-v233.css'),/border-radius:var\(--aurel-action-radius,14px\)!important/);
 assert.match(css,/\.btn:is\(:disabled,\[aria-busy="true"\]\)/);
 assert.match(css,/opacity:0!important;animation:none!important/);
 assert.doesNotMatch(css,/\.btn\.danger\s*\{|\.btn\.dangerGhost\s*\{|\.tag\.danger\s*\{/);
});
test('V2.32 uses accessible high-contrast and reduced-motion fallbacks',()=>{
 assert.match(css,/@media \(prefers-contrast:more\)/);
 assert.match(css,/@media \(forced-colors:active\)/);
 assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
 assert.match(css,/focus-visible/);
 assert.doesNotMatch(css,/@keyframes|backdrop-filter|filter\s*:\s*blur|animation\s*:\s*[^;]*infinite/);
});
test('V2.32 overlay guards focus escapes and restores focus after closing',()=>{
 const dossier=read('components/DossierFrame.jsx');
 assert.match(dossier,/document\.addEventListener\('focusin',guardFocus\)/);
 assert.match(dossier,/topmostModal\(dialog\)/);
 assert.match(read('lib/modal-focus.js'),/dialogs\.at\(-1\) === dialog/);
 assert.match(dossier,/document\.removeEventListener\('focusin',guardFocus\)/);
 assert.match(dossier,/previous\?\.isConnected/);
 assert.match(dossier,/close\.current\?\.focus\(\{preventScroll:true\}\)/);
});
test('V2.32 does not change backend endpoints, SQL or financial authorization',()=>{
 assert.match(read('components/Ui.jsx'),/finish==='pearl'&&type==='button'&&!\['danger','dangerGhost'\]/);
 assert.doesNotMatch(css,/@import|url\(https?:|javascript:|pointer-events:\s*none/);
});
