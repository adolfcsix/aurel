import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const browser=readFileSync(new URL('../../scripts/qa-react-browser.mjs',import.meta.url),'utf8');
const vite=readFileSync(new URL('../vite.config.js',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8'));
test('V2.58 browser acceptance uses real React and Chromium rather than an HTML imitation',()=>{
 assert.match(browser,/Chromium CDP/);
 assert.match(browser,/aurel-auth-submit/);
 assert.match(browser,/Thêm căn hộ/);
 assert.match(browser,/fetch\('\/api\/state'/);
 assert.match(browser,/document\.documentElement\.scrollWidth/);
 assert.match(browser,/React integration NOT RUN/);
 assert.doesNotMatch(browser,/from ['"](?:playwright|selenium)|require\(['"](?:playwright|selenium)/i); // No external browser runtime
});
test('V2.58 live browser isolation overrides the API target without changing the default',()=>{
 assert.match(vite,/process\.env\.AUREL_API_PROXY_TARGET/);
 assert.match(vite,/http:\/\/127\.0\.0\.1:4100/);
 assert.match(browser,/AUREL_DEMO_DATA_DIR:workspace/);
 assert.match(browser,/AUREL_STORAGE:'json'/);
 assert.match(browser,/mkdtemp/);
 assert.match(browser,/rm\(workspace/);
 assert.ok(pkg.scripts['qa:browser']);
});
