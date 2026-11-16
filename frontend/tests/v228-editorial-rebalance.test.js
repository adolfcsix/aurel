import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../src/'+path,import.meta.url),'utf8');
test('V2.28 replaces repeated boxed dossiers with editorial sections',()=>{
 const frame=read('components/DossierFrame.jsx');
 assert.match(frame,/aurel-dossier-block-content/);
 assert.match(frame,/aurel-dossier-hero/);
 assert.doesNotMatch(frame,/aurel-dossier-seal|aurel-dossier-period/);
 assert.match(frame,/HỒ SƠ TÀI SẢN/);
});
test('V2.28 typography and spacing use dividers rather than miniature cards',()=>{
 const css=read('atelier-v228.css');
 for(const rule of [/\.aurel-dossier-kpis>div/,/\.aurel-dossier-detail/,/\.aurel-dossier-block-content/,/\.aurel-dossier-record/,/border-bottom/,/grid-template-columns/])assert.match(css,rule);
 assert.match(css,/\.aurel-dossier-detail[\s\S]*border-radius:0!important/);
 assert.match(css,/\.aurel-dossier-kpis>div[\s\S]*border-radius:0!important/);
 assert.doesNotMatch(css,/animation:\s*infinite|backdrop-filter|filter:\s*blur/i);
});
test('V2.28 maintains unified button shape, focus and reduced motion',()=>{
 const css=read('atelier-v228.css');
 for(const rule of [/border-radius:14px/,/focus-visible/,/prefers-reduced-motion:reduce/,/max-width:370px/,/max-width:700px/])assert.match(css,rule);
 const main=read('main.jsx');assert.match(main,/import '\.\/atelier-v227\.css';\s*import '\.\/atelier-v228\.css';/);
});
test('V2.28 section navigation remains semantic and marks the current chapter',()=>{
 const frame=read('components/DossierFrame.jsx');
 assert.match(frame,/IntersectionObserver/);
 assert.match(frame,/aria-current=\{activeSection===key\?"location":undefined\}/);
 assert.match(frame,/type="button" onClick=\{\(\)=>jumpTo\(key\)\}/);
 assert.match(frame,/role="dialog" aria-modal="true"/);
 assert.match(frame,/target\.querySelector\('h3'\)\?\.focus/);
});
test('V2.28 keeps identity ambiguity explicit and does not imply a fake tenant link',()=>{
 const client=read('components/ClientDossier.jsx');
 const lease=read('components/LeaseDossier.jsx');
 assert.match(client,/chưa xác nhận người thuê bằng mã hồ sơ/);
 assert.match(lease,/Tên ghi trên hợp đồng được giữ nguyên để đối chiếu/);
 assert.doesNotMatch(client,/client\.name\s*===\s*lease\.tenantName/);
});
test('V2.28 does not embed external fonts or introduce new external UI dependencies',()=>{
 const css=read('atelier-v228.css');
 assert.doesNotMatch(css,/@import|url\(https?:|font-face/);
 const root=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8'));
 const front=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 const backend=JSON.parse(readFileSync(new URL('../../backend/package.json',import.meta.url),'utf8'));
 assert.match(root.version,/^2\.(?:2[8-9]|[3-9]\d)\.0$/);assert.equal(front.version,root.version);assert.equal(backend.version,root.version);
});
