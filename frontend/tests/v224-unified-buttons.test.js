import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=relative=>readFileSync(new URL('../src/'+relative,import.meta.url),'utf8');
const css=read('atelier-v224.css');

test('V2.24: design system is loaded last and version metadata is current',()=>{
 const main=read('main.jsx');
 assert.match(main,/atelier-v223\.css';\s*import '\.\/atelier-v224\.css';/);
 assert.match(readFileSync(new URL('../../package.json',import.meta.url),'utf8'),/"version": "2\.(?:2[4-9]|[3-9]\d)\.0"/);
});
test('V2.24: single corner token for every real button, including pearl, icons and destructive actions',()=>{
 assert.match(css,/--aurel-action-radius:\s*14px/);
 assert.match(css,/button\s*\{\s*border-radius:\s*var\(--aurel-action-radius\)\s*!important/);
 assert.match(css,/\.aurel-pearl-control:disabled/);
 assert.match(css,/\.aurel-auth-submit/);
 assert.match(css,/\.aurel-record-quiet/);
 assert.match(css,/\.aurel-access-actions button/);
 assert.match(css,/\.aurel-lease-row-actions button/);
 assert.match(css,/\.aurel-account-popover>button/);
});
test('V2.24: base action component declares one family while keeping legacy contract and semantic finishes',()=>{
 const ui=read('components/Ui.jsx');
 assert.match(ui,/data-aurel-control="action"/);
 assert.match(ui,/data-aurel-tone=\{kind\}/);
 assert.match(ui,/data-aurel-finish=\{pearl\?'pearl':'satin'\}/);
 assert.match(ui,/finish==='pearl'&&type==='button'&&!\['danger','dangerGhost'\]\.includes\(kind\)/);
 assert.match(css,/\.btn:is\(\.danger,\.dangerGhost\)\s*\{\s*box-shadow:none/);
});
test('V2.24: touch targets and readability cover auth, records, modal and icon-only controls',()=>{
 for(const pattern of [/--aurel-action-hit:\s*44px/,/--aurel-action-hit-prominent:\s*48px/,
   /\.aurel-find-close/,/\.aurel-auth-reveal/,/\.aurel-record-action/,/\.icon-btn/,/\.spatial-actions button/,
   /font-size:var\(--aurel-action-type\)/,/focus-visible/]) assert.match(css,pattern);
});
test('V2.24: segmented navigation keeps distinction while using family curvature',()=>{
 for(const pattern of [/\.aurel-auth-switch/,/\.aurel-workbench-tabs/,/\.aurel-lease-filters/,/\.quality-filter/,/\.portfolio-project/,/\.atelier-task/]) assert.match(css,pattern);
});
test('V2.24: motion stays lightweight and no new heavy visual effects',()=>{
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/@media\(hover:none\)/);
 const uncommented=css.replace(/\/\*[\s\S]*?\*\//g,'');
 assert.doesNotMatch(uncommented,/@keyframes|backdrop-filter|filter:\s*blur|animation:\s*[^n]/);
});
