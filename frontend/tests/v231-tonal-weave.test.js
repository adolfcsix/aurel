import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const css=read('atelier-v231.css');
const token=name=>{const match=css.match(new RegExp('--'+name+'\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;'));assert.ok(match,`Missing token: ${name}`);return match[1];};
const luminance=(hex)=>{const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
const contrast=(a,b)=>{const [x,y]=[luminance(a),luminance(b)].sort((v,w)=>w-v);return (x+.05)/(y+.05);};
test('V2.31 loads after all existing color and layout refinements',()=>{
 const main=read('main.jsx');assert.match(main,/import '\.\/atelier-v230\.css';\s*import '\.\/atelier-v231\.css';/);
});
test('V2.31 has a restrained repeatable palette across menu, sheet, form and dossier',()=>{
 for(const name of ['canvas','paper','pearl','sage','mist','champagne','forest','ink','secondary','accent','line'])token('maison-31-'+name);
 for(const selector of ['.sidebar {','.topbar {','.content-wrap :is(.panel','.atelier-editor .editor-body {','.aurel-dossier-hero {'])assert.ok(css.includes(selector),`Missing coverage ${selector}`);
 assert.match(css,/--maison-31-canvas-wash:\s*radial-gradient/);
 assert.match(css,/--maison-31-sheet-wash:\s*linear-gradient/);
 assert.match(css,/--maison-31-pine-wash:\s*linear-gradient/);
});
test('V2.31 body, supporting text, accent, action labels meet WCAG AA normal-text contrast',()=>{
 for(const [fg,bg] of [
  ['ink','canvas'],['secondary','canvas'],['accent','paper'],['ink','sage'],['forest','pearl'],['secondary','mist']
 ]){const actual=contrast(token('maison-31-'+fg),token('maison-31-'+bg));assert.ok(actual>=4.5,`${fg} against ${bg}: ${actual.toFixed(2)}:1`);}
 assert.ok(contrast('#fffdf7',token('maison-31-forest'))>=4.5);
});
test('V2.31 does not introduce animation loops, blur filters, or new button silhouettes',()=>{
 assert.doesNotMatch(css,/(?:backdrop-filter\s*:|filter\s*:\s*blur|animation\s*:\s*[^;]*infinite)/i);
 assert.doesNotMatch(css,/border-radius\s*:\s*(?:999px|50%|[0-9]+px)/i);
 assert.doesNotMatch(css,/pointer-events\s*:\s*none/i);
 assert.match(css,/@media \(prefers-reduced-motion:reduce\)/);
 assert.match(read('atelier-v229.css'),/button\{border-radius:var\(--aurel-action-radius\)!important/);
});
test('V2.31 leaves destructive and approval action finishes untouched',()=>{
 assert.match(css,/\.btn:not\(\.primary\):not\(\.danger\):not\(\.dangerGhost\)/);
 assert.doesNotMatch(css,/\.btn\.danger\s*\{|\.btn\.dangerGhost\s*\{|\.tag\.danger\s*\{/);
 assert.match(read('components/Ui.jsx'),/pearl=finish==='pearl'&&type==='button'&&!\['danger','dangerGhost'\]/);
});
test('V2.31 is a presentation-only release with unchanged API and DB',()=>{
 assert.doesNotMatch(css,/url\(\s*https?:|@import|javascript:/i);
 assert.match(css,/:where\(button,a,input,select,textarea,\[tabindex\]\):focus-visible/);
});
