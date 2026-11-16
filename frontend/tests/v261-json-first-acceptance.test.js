import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=relative=>readFileSync(path.join(root,relative),'utf8');
const backend=JSON.parse(read('backend/package.json'));
const scripts=JSON.parse(read('package.json')).scripts;

test('V2.61: JSON/React has only Express as mandatory backend runtime dependency',()=>{
 assert.deepEqual(Object.keys(backend.dependencies),['express']);
 assert.equal(backend.optionalDependencies.pg,'^8.13.1');
 assert.equal(backend.optionalDependencies.exceljs,'^4.4.0');
});
test('V2.61: UI integration excludes optional PG and XLSX but PG gate still requires pg',()=>{
 const gate=read('scripts/qa-gate.mjs');
 assert.match(gate,/pgRequested\?\['express','pg'\]:\['express'\]/);
 assert.match(gate,/Dedicated disposable PostgreSQL test target/);
 const browser=read('scripts/qa-react-browser.mjs');
 assert.match(browser,/\['backend',\['express'\]\]/);
 assert.match(browser,/coreBrowserDependencies\(\)/);
 assert.match(browser,/AUREL_DEMO_DATA_DIR:workspace/);
 assert.ok(scripts['qa:gate:ui'].includes('--browser'));
 assert.ok(scripts['qa:gate:pg'].includes('--postgres'));
});
test('V2.61: optional XLSX smoke is strictly opt-in and core CSV/CRUD smoke remains',()=>{
 const smoke=read('scripts/smoke.mjs');
 assert.match(smoke,/if\(process\.argv\.includes\('--xlsx'\)\)\{/);
 assert.match(smoke,/await request\('POST','\/units'/);
 assert.match(smoke,/await request\('POST','\/import\/units\/commit'/);
 assert.equal(scripts['smoke:xlsx'].includes('--xlsx'),true);
});
test('V2.61: unit PATCH guard uses normalized money rather than raw request type',()=>{
 const code=read('backend/src/index.js');
 assert.match(code,/assertSafeDepositReferenceEdit\(db,row\.id,before\.deposit,updated\.deposit\)/);
 assert.doesNotMatch(code,/req\.body\.deposit!==before\.deposit/);
});
