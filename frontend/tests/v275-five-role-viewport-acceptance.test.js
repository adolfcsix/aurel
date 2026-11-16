import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const script=readFileSync(path.join(root,'scripts/qa-react-browser.mjs'),'utf8');

test('V2.75: each role gets iPhone, tablet and desktop layout checks without extra UI controls',()=>{
 assert.match(script,/for\(const width of \[375,430,768,1024\]\)/);
 assert.match(script,/await checkLayout\(cdp,width\)/);
 assert.match(script,/for\(const \[pageIndex,label\] of ROLE_NAVIGATION\[role\]\.entries\(\)\)/);
});
test('V2.75: escape dismissal must restore mobile inert menu instead of leaving navigation overlay active',()=>{
 assert.match(script,/mobile Escape dismissal/);
 assert.match(script,/Input\.dispatchKeyEvent/);
 assert.match(script,/key:'Escape'/);
 assert.match(script,/closed menu must be inert/);
});
