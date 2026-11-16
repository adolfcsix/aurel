import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const text=readFileSync(new URL('../../scripts/qa-react-browser.mjs',import.meta.url),'utf8');

test('V2.59: live React acceptance checks a committed apartment on disposable disk, not just in memory',()=>{
 assert.match(text,/await readFile\(path\.join\(workspace,'local-demo\.json'\),'utf8'\)/);
 assert.match(text,/persisted\.units\.find\(u=>u\.code===code\)\?\.id/);
 assert.match(text,/restored\?\.code,persisted\.units\.find/);
 assert.match(text,/AUREL_DEMO_DATA_DIR:workspace/);
 assert.match(text,/AUREL_STORAGE:'json'/);
});

test('V2.59: browser acceptance covers responsive login and bounds unresponsive CDP operations',()=>{
 assert.match(text,/for\(const width of \[320,390\]\)/);
 assert.match(text,/checkLayout\(cdp,width\)/);
 assert.match(text,/Chromium command timed out:/);
 assert.match(text,/this\.pending\.delete\(id\)/);
 assert.match(text,/clearTimeout\(timeout\)/);
});
