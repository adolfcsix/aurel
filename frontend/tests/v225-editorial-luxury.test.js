import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../src/'+f,import.meta.url),'utf8');
const css=read('atelier-v225.css');

test('V2.25 editorial layer is imported after unified 14px action system',()=>{
 const m=read('main.jsx');
 assert.match(m,/import '\.\/atelier-v224\.css';\s*import '\.\/atelier-v225\.css';/);
 assert.match(css,/--aurel-25-action-radius:\s*14px/);
 assert.match(css,/button\s*\{border-radius:var\(--aurel-25-action-radius\)!important;/);
});
test('V2.25 uses generous spacing, matte surfaces and Vietnamese-compatible offline type',()=>{
 for(const re of [/--aurel-25-space-6:\s*64px/,/--aurel-25-canvas:/,/--aurel-25-sheet:/,/--aurel-25-rule:/,/--aurel-25-ui:[^;]*Be Vietnam Pro/,/--aurel-25-display:/,/\.atelier-hero-main/,/\.data-grid td/,/\.form-field>/]) assert.match(css,re);
});
test('V2.25 luxury layer does not introduce blur, spinning effects or global animations',()=>{
 const clean=css.replace(/\/\*[\s\S]*?\*\//g,'');
 assert.doesNotMatch(clean,/backdrop-filter|filter:\s*blur|@keyframes|animation:\s*(?!none\b)[a-z]/);
 assert.match(clean,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(clean,/@media\(hover:none\)/);
});
test('V2.25 retains accessible input targets, focus, small viewport and financial clarity',()=>{
 for(const re of [/min-height:48px/,/\.page-actions \.btn \{flex:1/,/focus-visible/,/max-width:700px/,/max-width:360px/,/\.btn:is\(\.danger,\.dangerGhost\)/,/\.aurel-workbench-figures dd/]) assert.match(css,re);
});
test('V2.25 dashboard uses precise Vietnamese editorial copy, without marketing CTA',()=>{
 const home=read('components/ExecutiveOverview.jsx');
 for(const phrase of ['DANH MỤC TÀI SẢN','Mở danh mục tài sản','TÀI CHÍNH','CÔNG VIỆC ƯU TIÊN']) assert.ok(home.includes(phrase),phrase);
 for(const phrase of ['Khám phá danh mục','PROPERTY PORTFOLIO','FINANCIAL OVERVIEW']) assert.ok(!home.includes(phrase),phrase);
});
test('V2.65 auth offers immediate viewer access with a private portfolio boundary',()=>{
 const auth=read('components/AuthPortal.jsx');
 assert.match(auth,/Kích hoạt tài khoản/);
 assert.match(auth,/Đăng ký xong vào ngay/);
 assert.match(auth,/<BrandWordmark\/>/); // V2.47: official approved logo replaces the old CSS lettering.
 assert.match(auth,/Đăng nhập AUREL/);
});
test('V2.25 package versions remain synchronized',()=>{
 const root=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8'));
 const front=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 const backend=JSON.parse(readFileSync(new URL('../../backend/package.json',import.meta.url),'utf8'));
 assert.match(root.version,/^2\.(?:2[8-9]|[3-9]\d)\.0$/);assert.equal(front.version,root.version);assert.equal(backend.version,root.version);
});
