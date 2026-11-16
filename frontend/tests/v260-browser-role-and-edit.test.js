import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../../scripts/qa-react-browser.mjs',import.meta.url),'utf8');

test('V2.60: live browser acceptance requires React create AND real dossier edit with disk verification',()=>{
 assert.match(source,/clickByText\('\.v09-dossier-actions button','Sửa thông tin'\)/);
 assert.match(source,/fillLabeledField\(cdp,'Ghi chú nội thất'/);
 assert.match(source,/fillLabeledField\(cdp,'Giá thuê tham khảo \(VND\)'/);
 assert.match(source,/diskAfterEdit\.units\.find\(u=>u\.id===saved\.id\)/);
 assert.match(source,/afterEditReload\.body\?\.units\?\.find/);
});

test('V2.60: the same live acceptance verifies server-side RBAC, not just hidden menus',()=>{
 assert.match(source,/\['manager','accountant','staff','viewer'\]/);
 assert.match(source,/\/auth\/users/);
 assert.match(source,/\/auth\/logout/);
 assert.match(source,/assert\.equal\(denied\.status,403/);
 assert.match(source,/Viewer must not receive customer PII/);
 assert.match(source,/Unassigned staff must see no units/);
});

test('V2.60: no production DB URL or existing company data are used by browser acceptance',()=>{
 assert.match(source,/workspace=await mkdtemp/);
 assert.match(source,/AUREL_STORAGE:'json'/);
 assert.match(source,/AUREL_DEMO_DATA_DIR:workspace/);
 assert.match(source,/await rm\(workspace,/);
});
