import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const script=readFileSync(path.join(root,'scripts/qa-react-browser.mjs'),'utf8');
const rootPackage=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));

test('V2.74: recovery proof rejects tampered snapshot and restores isolated finance records across process restarts',()=>{
 const outside=mkdtempSync(path.join(tmpdir(),'aurel-external-not-touched-'));
 try{
  mkdirSync(path.join(outside,'private'),{recursive:true});
  const original=path.join(outside,'private','local-demo.json');
  const bytes='DO NOT TOUCH THIS EXTERNAL DEMO DATA';writeFileSync(original,bytes);
  const run=spawnSync(process.execPath,['scripts/qa-json-recovery.mjs'],{
   cwd:root,encoding:'utf8',timeout:25000,env:{...process.env,AUREL_DEMO_DATA_DIR:path.join(outside,'private'),AUREL_STORAGE:'postgres',DATABASE_URL:'postgres://blocked.invalid/prod'}});
  assert.equal(run.status,0,run.stderr||run.error?.message);
  assert.match(run.stdout,/PASS isolated JSON disaster-recovery drill/);
  assert.match(run.stdout,/PostgreSQL recovery NOT RUN/);
  assert.equal(readFileSync(original,'utf8'),bytes,'QA recovery must never touch caller paths');
 }finally{rmSync(outside,{force:true,recursive:true})}
});

test('V2.74: browser UAT visits every permitted route, verifies real workspace and responsive overflow',()=>{
 assert.match(script,/for\(const \[pageIndex,label\] of ROLE_NAVIGATION\[role\]\.entries\(\)\)/);
 assert.match(script,/await clickNavigationLabel\(cdp,label\)/);
 assert.match(script,/document\.querySelector\('\.content-wrap'\)\?\.children\.length>1/);
 assert.match(script,/await checkLayout\(cdp,1440\)/);
 assert.match(script,/assert\.equal\(cdp\.errors\.length,0,`\$\{role\} page/);
});

test('V2.74: mobile browser must open accessible menu then close it by navigating to apartment catalog',()=>{
 assert.match(script,/Mở danh mục điều hướng/);
 assert.match(script,/mobile-open\[role=dialog\]:not\(\[inert\]\)/);
 assert.match(script,/clickNavigationLabel\(cdp,'Danh mục căn hộ'\)/);
 assert.match(script,/aurel-sidebar\[inert\]/);
 assert.match(script,/await checkLayout\(cdp,390\)/);
});

test('V2.74: version and isolated recovery command are present in three package manifests',()=>{
 const version=/^2\.(\d+)\.0$/.exec(rootPackage.version);
 assert.ok(version&&Number(version[1])>=74,'Release must be V2.74 or later, not capped at V2.79');
 assert.equal(rootPackage.scripts['qa:recovery:json'],'node scripts/qa-json-recovery.mjs');
 for(const folder of ['frontend','backend']){
  const leaf=JSON.parse(readFileSync(path.join(root,folder,'package.json'),'utf8'));
  assert.equal(leaf.version,rootPackage.version);
 }
});
