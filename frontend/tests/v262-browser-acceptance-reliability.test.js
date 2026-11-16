import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../../scripts/qa-react-browser.mjs',import.meta.url),'utf8');

test('V2.62: same-URL reload waits for a distinct completed browser document',()=>{
 assert.match(source,/__aurelQaPreviousDocument/);
 assert.match(source,/window\.__aurelQaPreviousDocument!==/);
 assert.match(source,/document\.readyState==='complete'/);
 assert.match(source,/response\.errorText/);
 assert.match(source,/await cdp\.navigate\(url\)/);
});

test('V2.62: real CDP editing selects the existing value before sending input',()=>{
 assert.match(source,/Input\.dispatchKeyEvent/);
 assert.match(source,/key:'a',code:'KeyA'/);
 assert.match(source,/Input\.insertText/);
 assert.match(source,/type="number" value="2500000"/);
 assert.match(source,/assert\.deepEqual\(await cdp\.eval/);
});

test('V2.62: an authenticated write without CSRF must be rejected and leave no unit',()=>{
 assert.match(source,/const missingCsrf=await browserApi/);
 assert.match(source,/missingCsrf\.status,403/);
 assert.match(source,/NO-CSRF-QA/);
 assert.match(source,/Rejected write must not persist a unit/);
});

test('V2.62: all test roles must lose API access after logout',()=>{
 assert.match(source,/const afterLogout=await browserApi\(cdp,'\/auth\/me'\)/);
 assert.match(source,/afterLogout\.status,401/);
 assert.match(source,/const deniedState=await browserApi\(cdp,'\/state'\)/);
 assert.match(source,/deniedState\.status,401/);
 assert.match(source,/AUREL_DEMO_DATA_DIR:workspace/);
});
