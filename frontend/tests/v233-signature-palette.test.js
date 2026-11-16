import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const css=read('atelier-v233.css');
const hex = key => {
 const match=css.match(new RegExp(`--maison-33-${key}:\s*(#[a-fA-F0-9]{6})\s*;`));
 assert.ok(match,`missing ${key}`);return match[1];
};
const luminance=(h)=>{
 const rgb=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);
 return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
test('V2.33: signature layer is imported last without dropping V2.32 surface and other earlier styles',()=>{
 const imports=[...read('main.jsx').matchAll(/import '\.\/(atelier-v\d+)\.css';/g)].map(x=>x[1]);
 assert.equal(imports.at(-1),'atelier-v233');
 assert.ok(imports.includes('atelier-v232'));
 assert.equal(new Set(imports).size,imports.length);
});
test('V2.33: silk and porcelain lead, while jade/champagne remain subtle supporting hues',()=>{
 for(const key of ['forest','forest-deep','forest-soft','porcelain','silk','ivory','jade','mist','champagne','copper','ink','muted','rule']) hex(key);
 for(const segment of ['--maison-33-shell:','--maison-33-sheet:','--maison-33-header:','--maison-33-rail:']) assert.ok(css.includes(segment));
 assert.match(css,/--maison-surface-page:var\(--maison-33-shell\)/);
 assert.match(css,/--maison-surface-pure:var\(--maison-33-porcelain\)/);
 assert.match(css,/--maison-surface-quiet:var\(--maison-33-ivory\)/);
});
test('V2.33: key editorial and navigation pairs remain above WCAG 4.5:1 for normal text',()=>{
 const pairs=[['ink','porcelain'],['muted','silk'],['copper','silk'],['ink','jade']];
 for(const [fg,bg] of pairs) assert.ok(contrast(hex(fg),hex(bg))>=4.5,`${fg} on ${bg}: ${contrast(hex(fg),hex(bg))}`);
 assert.ok(contrast('#fffefa',hex('forest'))>=7);
 assert.ok(contrast('#e5d4ae',hex('forest'))>=4.5);
});
test('V2.33: same 14px action silhouette; dangerous and money operations are not restyled',()=>{
 assert.match(css,/border-radius:var\(--aurel-action-radius,14px\)!important/);
 assert.match(css,/\.btn:not\(\.primary\):not\(\.danger\):not\(\.dangerGhost\)/);
 assert.doesNotMatch(css,/(?:\.btn\.danger\s*\{|\.btn\.dangerGhost\s*\{|\.tag\.danger\s*\{|\.finance-note\s*\{)/);
 assert.doesNotMatch(css,/(pointer-events\s*:\s*none|@keyframes|backdrop-filter|filter\s*:\s*blur|animation\s*:\s*[^;]*infinite|@import|url\(https?:)/);
});
test('V2.33: component coverage includes navigation, hero, tables, forms, dossier and accessibility fallbacks',()=>{
 for(const selector of ['.sidebar .nav-item.active','.topbar','.atelier-hero-main','.data-grid th','.editor.atelier-editor','.atelier-editor .editor-body','.aurel-dossier-scroll','.aurel-account-popover']) assert.ok(css.includes(selector),selector);
 for(const media of ['prefers-contrast:more','forced-colors:active','max-width:700px','prefers-reduced-motion:reduce']) assert.ok(css.includes(media),media);
});
