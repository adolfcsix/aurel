import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../src/',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

test('V2.69 owner proposals are only in verified property page, never viewer admin or financial menu',()=>{
 const app=read('App.jsx'),component=read('components/OwnerChangeRequests.jsx');
 assert.match(app,/page==='owned-assets'&&canNavigate\(auth,'owned-assets'\)/);
 assert.match(app,/<OwnerChangeForm unit=\{unit\}/);
 assert.match(app,/can\('unit\.write'\)&&<OwnerChangeInbox/);
 assert.match(component,/\/me\/owned-units\/.*change-requests/);
 assert.match(component,/\/owner-change-requests\//);
 for(const bad of ['rent:','deposit:','feePercent:','ownerId:','password:'])assert.ok(!component.includes(bad),bad);
});
test('V2.69 proposal form and manager inbox expose useful status and safe actions without new finance navigation',()=>{
 const component=read('components/OwnerChangeRequests.jsx');
 for(const label of ['Đề nghị cập nhật thông tin căn hộ','Thông tin cần cập nhật','Lý do điều chỉnh','Đang chờ','Đã duyệt','Đã từ chối','Duyệt cập nhật','Từ chối'])assert.match(component,new RegExp(label));
 assert.match(component,/canSubmit/);
 assert.match(component,/pending\|\|submitted\?/);
 assert.doesNotMatch(component,/\brole\s*=\s*['"]manager/);
});
test('V2.69 secure API routes enforce server authorization and CSRF via existing middleware',()=>{
 const backend=readFileSync(new URL('../../backend/src/index.js',import.meta.url),'utf8');
 const ownership=readFileSync(new URL('../../backend/src/ownership.js',import.meta.url),'utf8');
 assert.match(backend,/app\.use\('\/api',authenticate\)/);
 assert.match(backend,/x-csrf-token/);
 assert.match(backend,/app\.post\('\/api\/me\/owned-units\/:unitId\/change-requests'/);
 assert.match(backend,/app\.post\('\/api\/owner-change-requests\/:id\/:decision'/);
 assert.match(ownership,/matchedUnits\(db,owner\)/);
 assert.match(ownership,/assertUnitRevision\(unit,request.expectedRevision\)/);
 assert.match(ownership,/hasPermission\(actor,'unit\.write'\)/);
});
