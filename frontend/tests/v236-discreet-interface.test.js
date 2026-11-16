import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const read=(path)=>readFileSync(fileURLToPath(new URL('../'+path,import.meta.url)),'utf8');
test('v2.36: top-bar search offers an action without visible keyboard coaching',()=>{
 const app=read('src/App.jsx');
 assert.match(app,/aria-keyshortcuts="Control\+K Meta\+K"/);
 assert.match(app,/aria-label="Tìm kiếm hồ sơ và điều hướng"/);
 assert.doesNotMatch(app,/<kbd>⌘ \/ Ctrl K<\/kbd>/);
});
test('v2.36: search has no public key-by-key tutorial but keeps real keyboard navigation',()=>{
 const search=read('src/components/PrivateSearch.jsx');
 assert.doesNotMatch(search,/<kbd>|Di chuyển <kbd>|Mở <kbd>|Esc<\/kbd>/);
 assert.match(search,/event\.key==='ArrowDown'/);
 assert.match(search,/event\.key==='ArrowUp'/);
 assert.match(search,/event\.key==='Enter'/);
 assert.match(search,/containModalTab\(/);
});
test('v2.36: supporting microcopy does not tell users to find elementary controls',()=>{
 const app=read('src/App.jsx');
 const imports=read('src/components/ImportPanel.jsx');
 assert.doesNotMatch(app,/bằng nút phía trên/);
 assert.doesNotMatch(imports,/nhấn Kiểm tra dữ liệu/);
 assert.match(imports,/Chưa phát sinh thay đổi trong danh mục/);
});
test('v2.36: preview has no tutorial cards, demo key hints or disabled interactions',()=>{
 const view=read('../docs/previews/editorial.html');
 assert.doesNotMatch(view,/Cách thử:|Thử phím|Nhấn Tab|Shift\+Tab qua|python -m http/);
 assert.match(view,/id="form-dialog"/);
 assert.match(view,/id="open"/);
 assert.match(view,/id="confirm-dialog"/);
 assert.match(view,/id="discard"/);
 assert.match(view,/dialogFocusables\(/);
 assert.match(view,/containModalTab\(/);
});
test('v2.36: QA fixture retains live imported dialog focus, without onscreen instructions',()=>{
 const view=read('../docs/previews/focus.html');
 assert.match(view,/import \{dialogFocusables,topmostModal,containModalTab\} from/);
 assert.doesNotMatch(view,/Cách thử:|Thử phím Tab|Sẵn sàng kiểm tra phím/);
});
