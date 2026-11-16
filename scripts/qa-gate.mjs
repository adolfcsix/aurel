import {disposablePgTarget} from './pg-test-config.mjs';
/**
 * Explicit integration acceptance gate. Not a deployment script.
 * Default: local unit tests -> React build -> disposable JSON HTTP smoke.
 * --postgres adds read-only schema verification and a WRITE smoke restricted by
 * scripts/smoke.mjs to a disposable database ending in _test plus explicit ACK.
 * Never changes a production database and never prints connection secrets.
 */
import {spawn,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const backend=createRequire(path.join(root,'backend/package.json'));
const frontend=createRequire(path.join(root,'frontend/package.json'));
const tooling=createRequire(path.join(root,'package.json'));
const pgRequested=process.argv.includes('--postgres');
const browserRequested=process.argv.includes('--browser');
const failures=[];
function gate(label,condition,reason){
 console.log(`${condition?'PASS':'BLOCK'} ${label}${condition?'':': '+reason}`);
 if(!condition)failures.push(label);
}
console.log(`AUREL integration gate — ${pgRequested?'PostgreSQL disposable test':'local JSON demo'} (does not certify production or UI aesthetics)`);
// JSON/React UAT should not be blocked by unused DB or Excel parsers.
// PostgreSQL remains mandatory for --postgres and all financial PG acceptance.
const deps=[['frontend',frontend,['react','react-dom','vite']],['backend',backend,pgRequested?['express','pg']:['express']]];
deps.push(['QA',tooling,['esbuild','jsdom']]);
for(const [where,req,modules] of deps)for(const name of modules){
 let ok=false;try{req.resolve(name);ok=true}catch{}
 gate(`${where}/${name}`,ok,'npm install required at repository root');
}
const major=Number(process.versions.node.split('.')[0]);
gate('Node >=22',major>=22,`found ${process.version}`);
const sourceAudit=spawnSync(process.execPath,[path.join(root,'scripts/qa-source-integrity.mjs')],{cwd:root,encoding:'utf8',timeout:30000});
process.stdout.write(sourceAudit.stdout||'');
process.stderr.write(sourceAudit.stderr||'');
gate('Source integrity + approved AUREL identity',sourceAudit.status===0,'qa:source failed');
if(pgRequested){
 try {disposablePgTarget(process.env);gate('Dedicated disposable PostgreSQL test target',true,'');}
 catch(error){gate('Dedicated disposable PostgreSQL test target',false,error.message);}
}
if(failures.length){
 console.error(`BLOCKED: ${failures.length} prerequisite(s). No build, API smoke, or database write attempted.`);
 process.exit(2);
}
const node=process.execPath;
const run=async(label,command,args,timeoutMs)=>{
 console.log(`\nRUN  ${label}`);
 let result;
 try{
  result=await new Promise((resolve,reject)=>{
   // npm.cmd is a Windows command script. Node 22 spawn requires cmd-shell execution for .cmd files.
   const child=spawn(command,args,{cwd:root,env:process.env,stdio:'inherit',shell:process.platform==='win32'});
   const timeout=setTimeout(()=>{child.kill('SIGTERM');reject(new Error('timeout'))},timeoutMs);
   child.once('error',error=>{clearTimeout(timeout);reject(error)});
   child.once('exit',(code,signal)=>{clearTimeout(timeout);resolve({code,signal})});
  });
 }catch(e){console.error(`FAIL ${label}: ${e.message}`);failures.push(label);return}
 if(result.code!==0){console.error(`FAIL ${label} (exit ${result.code}, signal ${result.signal||'-'})`);failures.push(label)}
 else console.log(`PASS ${label}`);
};
const cmd=process.platform==='win32'?'npm.cmd':'npm';
await run('Node domain/contract tests',cmd,['test'],180000);
if(!failures.length)await run('React DOM behavior and permitted-screen rendering',cmd,['run','qa:dom'],60000);
if(!failures.length)await run('Read-only in-memory financial integrity gate',cmd,['run','qa:integrity:demo'],30000);
if(!failures.length)await run('React production build',cmd,['run','build'],120000);
if(!failures.length)await run('Disposable JSON HTTP smoke',cmd,['run','smoke'],120000);
// Full V2.70 journey covers registration, role boundaries, owner submission, review and revocation.
if(!failures.length&&browserRequested)await run('REAL React browser UAT (isolated JSON demo)',node,['scripts/qa-react-browser.mjs'],240000);
if(!failures.length&&pgRequested){
 // Enforce a truly empty, isolated target before executing migrations or HTTP writes.
 await run('Read-only test database inventory and safety gate',cmd,['run','qa:pg:inspect'],30000);
 if(!failures.length)await run('Apply ordered SQL migrations to disposable test database',cmd,['run','db:migrate:test'],60000);
 if(!failures.length)await run('Isolated REAL PostgreSQL atomic migration and rollback check',cmd,['run','qa:pg:atomic'],60000);
 if(!failures.length)await run('PostgreSQL read-only schema check',cmd,['run','pg:verify','--','--test-target'],60000);
 // Recovery inventory requires an empty _test public schema; execute before smoke writes QA rows.
 if(!failures.length)await run('Disposable PostgreSQL pg_dump / pg_restore recovery',cmd,['run','qa:recovery:pg'],120000);
 if(!failures.length)await run('Disposable PostgreSQL HTTP smoke',cmd,['run','smoke:pg'],120000);
}
if(failures.length){
 console.error(`\nNOT ACCEPTED: ${failures.join(', ')}. Review above errors; manual browser, UX and financial UAT remain required.`);
 process.exitCode=1;
}else{
 console.log(`\nAUTOMATED ${pgRequested?'PG':'JSON'} GATE PASSED. Still requires manual browser, permissions, real-device and financial UAT before deployment.`);
}
