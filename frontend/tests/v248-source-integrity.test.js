import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {inspectSource,relativeImports} from '../../scripts/qa-source-integrity.mjs';

test('V2.48 production source has no byte-for-byte duplicates or unresolved relative imports',()=>{
 const result=inspectSource();
 assert.equal(result.ok,true,result.issues.join('\n'));
 assert.ok(result.files>100);
});
test('V2.48 audit recognizes static, re-export and dynamic relative imports',()=>{
 assert.deepEqual(relativeImports(`import './foo.css'; import {b} from '../b.js'; export {q} from './q.js'; await import('./lazy.js');`),['./foo.css','../b.js','./q.js','./lazy.js']);
});
test('V2.48 audit rejects identical source files and missing relative imports',()=>{
 const tmp=mkdtempSync(path.join(tmpdir(),'aurel-qa-'));
 try{
  mkdirSync(path.join(tmp,'frontend/src'),{recursive:true});
  mkdirSync(path.join(tmp,'frontend/public/images'),{recursive:true});
  mkdirSync(path.join(tmp,'backend/src'),{recursive:true});
  mkdirSync(path.join(tmp,'scripts'),{recursive:true});
  writeFileSync(path.join(tmp,'frontend/src/main.jsx'),`import './base.css'; import './atelier-v233.css';`);
  writeFileSync(path.join(tmp,'frontend/src/base.css'),'a {color:red;}');
  writeFileSync(path.join(tmp,'frontend/src/atelier-v233.css'),'b {color:blue;}');
  writeFileSync(path.join(tmp,'backend/src/a.js'),`import './not-there.js';`);
  writeFileSync(path.join(tmp,'backend/src/b.js'),`import './not-there.js';`);
  for(const p of ['package.json','frontend/package.json','backend/package.json'])writeFileSync(path.join(tmp,p),'{"version":"2.48.0"}');
  const issues=inspectSource(tmp).issues.join(' | ');
  assert.match(issues,/Identical source files/);
  assert.match(issues,/Missing relative import/);
  assert.match(issues,/Approved AUREL logo changed/);
 }finally{rmSync(tmp,{recursive:true,force:true})}
});
test('V2.48 audit detects unintended CSS order changes and stale versions',()=>{
 const tmp=mkdtempSync(path.join(tmpdir(),'aurel-qa-'));
 try{
  mkdirSync(path.join(tmp,'frontend/src'),{recursive:true});
  mkdirSync(path.join(tmp,'frontend/public/images'),{recursive:true});
  mkdirSync(path.join(tmp,'backend/src'),{recursive:true});
  mkdirSync(path.join(tmp,'scripts'),{recursive:true});
  writeFileSync(path.join(tmp,'frontend/src/main.jsx'),`import './atelier-v233.css'; import './after.css';`);
  writeFileSync(path.join(tmp,'frontend/src/atelier-v233.css'),'a{}');
  writeFileSync(path.join(tmp,'frontend/src/after.css'),'b{}');
  for(const [p,v] of [['package.json','2.48.0'],['frontend/package.json','2.47.0'],['backend/package.json','2.48.0']])writeFileSync(path.join(tmp,p),JSON.stringify({version:v}));
  const issues=inspectSource(tmp).issues.join(' | ');
  assert.match(issues,/Maison signature CSS must remain last/);
  assert.match(issues,/Package version mismatch/);
 }finally{rmSync(tmp,{recursive:true,force:true})}
});

test('V2.48 continuous integration and QA gate both enforce source integrity',()=>{
 const gate=readFileSync(new URL('../../scripts/qa-gate.mjs',import.meta.url),'utf8');
 const ci=readFileSync(new URL('../../.github/workflows/integration-acceptance.yml',import.meta.url),'utf8');
 assert.match(gate,/qa-source-integrity\.mjs/);
 assert.match(ci,/npm run qa:source/);
});
test('QA evidence scripts write to one stable QA folder, not legacy root',()=>{
 const offline=readFileSync(new URL('../../scripts/qa-offline.mjs',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../../scripts/qa-ui-stability.mjs',import.meta.url),'utf8');
 assert.match(offline,/docs\/qa\/OFFLINE_EVIDENCE\.json/);
 assert.match(ui,/docs\/qa\/UX_STABILITY_EVIDENCE\.json/);
});
