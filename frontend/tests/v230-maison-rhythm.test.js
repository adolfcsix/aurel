import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {activeEditorChapter,editorScrollBehavior} from '../src/lib/editor-chapters.js';
const read=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
test('V2.30 active editor chapter follows vertical reading position',()=>{
 assert.equal(activeEditorChapter([25,190,430]),0);
 assert.equal(activeEditorChapter([-500,90,390]),1);
 assert.equal(activeEditorChapter([-500,-220,-10]),2);
 assert.equal(activeEditorChapter([undefined,NaN,Infinity],124,2),2);
 assert.equal(activeEditorChapter([],124,2),0);
});
test('V2.30 active chapter falls back safely when invalid or incomplete',()=>{
 assert.equal(activeEditorChapter([undefined,undefined],124,10),1);
 assert.equal(activeEditorChapter([undefined,undefined],124,-1),0);
 assert.equal(activeEditorChapter([Infinity,-8,NaN],124,0),1);
});
test('V2.30 honors reduced-motion on form chapter jumps',()=>{
 assert.equal(editorScrollBehavior(true),'auto');
 assert.equal(editorScrollBehavior(false),'smooth');
});
test('V2.30 form chapters are actual labelled sections that receive keyboard focus',()=>{
 const app=read('App.jsx');
 assert.match(app,/const goToChapter=index=>/);
 assert.match(app,/section\.querySelector\('h3'\)\?\.focus\(\{preventScroll:true\}\)/);
 assert.match(app,/aria-labelledby=\{"editor-section-title-"\+index\}/);
 assert.match(app,/tabIndex=\{-1\}>\{section\.title\}<\/h3>/);
});
test('V2.30 form chapter menu stays synchronized with scroll and mobile selector',()=>{
 const app=read('App.jsx');
 assert.match(app,/activeEditorChapter\(sectionRefs\.current\.map/);
 assert.match(app,/onScroll=\{updateActiveChapter\}/);
 assert.match(app,/aria-current=\{activeChapter===index\?'location':undefined\}/);
 assert.match(app,/value=\{activeChapter\} onChange=\{e=>goToChapter\(Number\(e\.target\.value\)\)\}/);
 assert.doesNotMatch(app,/atelier-mobile-jump[\s\S]{0,600}behavior:'smooth'/);
});
test('V2.30 quiet-luxury finishing layer preserves button and financial restraint',()=>{
 const css=read('atelier-v230.css');
 assert.match(css,/\.atelier-form-toc button\[aria-current="location"\]/);
 assert.match(css,/\.sidebar \.nav-item\{font-size:13px;min-height:48px;/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(css,/(?:backdrop-filter|animation:\s*infinite|filter:\s*blur)/);
 assert.match(read('main.jsx'),/import '\.\/atelier-v229\.css';\s*import '\.\/atelier-v230\.css';/);
});
test('V2.30 keeps the single 14px button silhouette and financial confirmation flow',()=>{
 const button=read('components/Ui.jsx'),app=read('App.jsx');
 assert.match(button,/pearl=finish==='pearl'&&type==='button'&&!\['danger','dangerGhost'\]/);
 assert.match(read('atelier-v229.css'),/button\{border-radius:var\(--aurel-action-radius\)!important/);
 assert.match(app,/if\(needsReview\)\{if\(!reviewVisible\)/);
 assert.match(app,/unverified\|\|\(trackedDossier&&!changesPending\)\)return/);
});
