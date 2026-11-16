import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../src/',import.meta.url);
const css=readFileSync(new URL('atelier-v233.css',root),'utf8');
const app=readFileSync(new URL('App.jsx',root),'utf8');
const overview=readFileSync(new URL('components/ExecutiveOverview.jsx',root),'utf8');
test('shared layout identifies the overview and operational contexts',()=>{
 assert.match(app,/data-aurel-layout=\{page==='dashboard'\?'overview':'workspace'\}/);
 assert.match(css,/\.content-wrap\[data-aurel-layout="overview"\]/);
});
test('content and topbar use a shared spacing token',()=>{
 assert.match(css,/--maison-layout-edge:clamp\(/);
 assert.match(css,/\.main-area>\.topbar\{padding-inline:var\(--maison-layout-edge\)/);
 assert.match(css,/\.content-wrap\{[^}]*var\(--maison-layout-edge\)/s);
});
test('page titles and action groups never share an inflexible horizontal row on medium screens',()=>{
 assert.match(css,/@media\(max-width:1330px\)\{[^}]*\.content-wrap \.page-header\{grid-template-columns:minmax\(0,1fr\)/s);
 assert.match(css,/\.content-wrap \.page-actions\{max-width:none;justify-content:flex-start;/);
});
test('mobile actions align to the page content instead of compressing navigation',()=>{
 assert.match(css,/@media\(max-width:620px\)\{/);
 assert.match(css,/\.content-wrap \.page-actions\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.content-wrap \.page-actions>\.btn:only-child\{grid-column:1\/-1/);
});
test('dashboard remains an editorial overview with real source-computed figures',()=>{
 assert.match(overview,/getPortfolioOverview\(data,period,date,\{includeFinancialTasks:showFinancial\}\)/);
 assert.match(overview,/state\.projectIndex\.length/);
 assert.match(overview,/state\.totals\.due/);
 assert.doesNotMatch(overview,/01 \/ 04|02 — ĐANG CHO THUÊ|03 — CĂN CÒN TRỐNG/);
});
test('portfolio layout adapts deliberately for tablet and phone',()=>{
 assert.match(css,/@media\(max-width:1090px\)/);
 assert.match(css,/@media\(max-width:800px\)/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(css,/\.atelier-ledger-columns\{grid-template-columns:1fr;\}/);
});
test('dossier and editor share reading-width and balanced columns',()=>{
 assert.match(css,/\.aurel-dossier-block\{grid-template-columns:minmax\(190px,\.72fr\) minmax\(0,1\.95fr\)/);
 assert.match(css,/\.atelier-editor \.atelier-form-contents\{grid-template-columns:minmax\(156px,181px\) minmax\(0,1fr\)/);
});
test('design retains 14px unified button silhouette and reduced-motion support',()=>{
 assert.match(css,/--maison-action-radius:var\(--aurel-action-radius,14px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
test('understated dashboard links still meet touch-target geometry',()=>{
 assert.match(css,/\.atelier-escrow button,\.atelier-ledger-footer button\{\s*min-height:44px/);
 assert.match(css,/\.content-wrap \.page-actions>\.btn:nth-child\(3\):last-child\{grid-column:1\/-1;/);
});
