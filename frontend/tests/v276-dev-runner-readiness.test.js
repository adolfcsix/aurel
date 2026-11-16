import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

const root=new URL('../../',import.meta.url);
const run=readFileSync(new URL('../../scripts/dev.mjs',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8'));

test('V2.76: VS Code startup has an explicit no-server dependency check',()=>{
 assert.equal(pkg.scripts['dev:check'],'node scripts/dev.mjs --check');
 const result=spawnSync(process.execPath,['scripts/dev.mjs','--check'],{cwd:root,encoding:'utf8',timeout:10000});
 const front=createRequire(new URL('../../frontend/package.json',import.meta.url));
 const back=createRequire(new URL('../../backend/package.json',import.meta.url));
 const missing=[['vite',front],['react',front],['react-dom',front],['express',back]].filter(([name,req])=>{try{req.resolve(name);return false}catch{return true}});
 if(missing.length){
  assert.equal(result.status,2,`Missing packages must exit with failure: ${result.stdout} ${result.stderr}`);
  assert.match(result.stderr,/npm install/);
 }else{
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/Chưa xác nhận/);
 }
});
test('V2.76: root dev runner propagates child errors and kills both watch process groups',()=>{
 assert.match(run,/child\.on\('error'/);
 assert.match(run,/child\.on\('exit'/);
 assert.match(run,/stop\(typeof code==='number'&&code!==0\?code:1\)/);
 assert.match(run,/process\.kill\(-child\.pid,'SIGTERM'\)/);
 assert.match(run,/taskkill\.exe/);
 assert.match(run,/process\.once\('SIGINT'/);
 assert.match(run,/process\.exitCode=2/);
});
