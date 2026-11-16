import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/components/Ui.jsx',import.meta.url),'utf8');
const forms=readFileSync(new URL('../src/atelier-forms.css',import.meta.url),'utf8');
const studio=readFileSync(new URL('../src/estate-studio.css',import.meta.url),'utf8');
test('V1.7: an edited form asks before discarding and cannot be dismissed during a save',()=>{
 assert.match(app,/const \[hasEdits,setHasEdits\]=useState\(false\)/);
 assert.match(app,/const requestClose=\(\)=>\{if\(busy\)return;if\(changesPending\)/);
 assert.match(app,/role="alertdialog" aria-modal="true" aria-label="Xác nhận bỏ thay đổi"/);
 assert.match(app,/Bỏ những thay đổi vừa nhập/);
 assert.match(app,/setHasEdits\(true\)/);
});
test('V1.7: editor keyboard and mobile section controls exist',()=>{
 assert.match(app,/e\.key==='Escape'/);
 assert.match(app,/containModalTab\(e,activeScope/);
 assert.match(app,/topmostModal\(activeScope\)/);
 assert.match(app,/const sectionRefs=useRef\(\[\]\)/);
 assert.match(app,/atelier-mobile-jump/);
 assert.match(forms,/\.atelier-mobile-jump select\{/);
 assert.match(forms,/env\(safe-area-inset-bottom\)/);
 assert.match(forms,/\.atelier-discard-backdrop\[hidden\]\{display:none!important\}/);
});
test('V1.7: no illustrative rent-based fee is displayed as actual collected-basis fee',()=>{
 assert.match(app,/draft\.feeBasis==='paid'/);
 assert.match(app,/Không lấy giá thuê tham khảo để thay thế số tiền thực thu/);
 assert.match(app,/canPreviewUnitFee/);
 assert.match(app,/chưa phải khoản phải thu/);
});
test('V1.7: row buttons do not trigger clickable table row navigation',()=>{
 assert.match(ui,/e\.target\.closest\('button,a,input,select,textarea,\[role=button\]'\)/);
});
test('V1.7: mobile menu has an accessible close action and cards preserve numerical hierarchy',()=>{
 assert.match(app,/aria-label="Đóng menu"/);
 assert.match(studio,/\.mobile-sidebar-close/);
 assert.match(studio,/\.aurel-unit-card \.aurel-record-meta-grid/);
 assert.match(studio,/font-variant-numeric:tabular-nums/);
});
