import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {visibleNavigationGroups} from '../src/lib/navigation-shell.js';
const read=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8');

test('V2.29 hides empty sections after permissions filter without mutating source',()=>{
 const source=[{name:'A',items:[['dashboard','Tổng quan'],['units','Căn hộ']]},{name:'B',items:[['fees','Phí']]},{name:'C',items:[]}];
 const result=visibleNavigationGroups(source,{role:'viewer'},(_,key)=>key==='dashboard');
 assert.deepEqual(result,[{name:'A',items:[['dashboard','Tổng quan']]}]);
 assert.equal(source[0].items.length,2);
});
test('V2.29 requires explicit permission predicate',()=>{
 assert.throws(()=>visibleNavigationGroups([]),TypeError);
});
test('V2.29 mobile rail traps Tab even if focus has escaped',()=>{
 const app=read('App.jsx');
 assert.match(app,/sidebarRef\.current\?\.contains\(document\.activeElement\)/);
 assert.match(app,/document\.body\.style\.overflow='hidden'/);
 assert.match(app,/event\.key==='Escape'/);
 assert.match(app,/focusContentAfterClose\.current/);
 assert.match(app,/document\.getElementById\('aurel-main'\)\?\.focus/);
});
test('V2.29 removes misleading workspace button visuals and uses role-filtered groups',()=>{
 const app=read('App.jsx');
 assert.match(app,/visibleNavigationGroups\(nav,user,\(user,key\)=>canNavigate\(user,key\)\)/);
 assert.match(app,/aurel-workspace-context/);
 assert.doesNotMatch(app,/className="workspace-card"/);
 assert.match(app,/aria-current=\{page===key\?'page':undefined\}/);
});
test('V2.29 account menu supports focus and expected menu semantics',()=>{
 const menu=read('components/AccountMenu.jsx');
 assert.match(menu,/triggerKeys/);assert.match(menu,/ArrowUp/);
 assert.match(menu,/onBlurCapture/);assert.match(menu,/role="separator"/);
 assert.match(menu,/aria-expanded=\{open\}/);
});
test('V2.29 restores search on narrow mobile and preserves unified button geometry',()=>{
 const css=read('atelier-v229.css');
 assert.match(css,/\.topbar \.aurel-top-search\{display:inline-flex!important/);
 assert.match(css,/border-radius:var\(--aurel-action-radius\)!important/);
 assert.match(css,/@media\(max-width:380px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(css,/(?:backdrop-filter|filter:\s*blur|animation:\s*infinite)/);
 assert.match(read('main.jsx'),/import '\.\/atelier-v228\.css';\s*import '\.\/atelier-v229\.css';/);
});
test('V2.29 JSX action buttons always declare type to avoid implicit form submission',()=>{
 for(const name of ['App.jsx','components/ExecutiveOverview.jsx','components/PropertyDossier.jsx']){
  const txt=read(name);assert.match(txt,/<button type="button"/);
 }
});
