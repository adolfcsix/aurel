/**
 * Current-release reproducible, NON-DESTRUCTIVE acceptance evidence.
 * Runs only domain/UI-contract tests and an in-memory demo integrity check.
 * It never starts the server, contacts PostgreSQL, or makes an HTTP write.
 * Integrations are BLOCKED until separately verified by qa:gate / qa:gate:pg.
 */
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const frontendRequire=createRequire(path.join(root,'frontend/package.json'));
const backendRequire=createRequire(path.join(root,'backend/package.json'));
const statuses=[];
const record=(name,status,detail)=>statuses.push({name,status,detail});
const launch=(label,args)=>{
 const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
 const output=(result.stdout||'')+'\n'+(result.stderr||'');
 record(label,result.status===0?'PASS':'FAIL',result.status===0?'Completed without errors':(result.error?.code||`exit ${result.status}`));
 return {status:result.status,output};
};
const tests=launch('Node contract and unit tests',['--test','--test-concurrency=4',...['backend','frontend'].flatMap(d=>readdirSync(path.join(root,d,'tests')).filter(n=>n.endsWith('.test.js')).sort().map(n=>path.join(d,'tests',n)))]);
const match=tests.output.match(/# pass (\d+)/);
const tally=match?Number(match[1]):null;
if(match)record('Passing test count','PASS',String(tally));
const integrity=launch('Read-only in-memory data integrity',['scripts/data-integrity.mjs','--demo-seed']);
let files=0,parseErrors=0,jsxFiles=0,tsx=null;
try{tsx=require('typescript')}catch{}
const walk=dir=>{for(const e of readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()){if(e.name!=='node_modules')walk(p);continue}
 if(!/\.(js|jsx|mjs)$/.test(p))continue;
 files++;if(p.endsWith('.jsx'))jsxFiles++;
 if(tsx){const content=readFileSync(p,'utf8'),kind=p.endsWith('.jsx')?tsx.ScriptKind.JSX:tsx.ScriptKind.JS;const tree=tsx.createSourceFile(p,content,tsx.ScriptTarget.Latest,true,kind);parseErrors+=tree.parseDiagnostics.length}
 }};
for(const d of ['frontend','backend','scripts'])walk(path.join(root,d));
if(tsx)record('JS/JSX/MJS parser',parseErrors?'FAIL':'PASS',`${files} files, ${parseErrors} parser errors`);
else record('JSX parser','NOT_RUN',`${jsxFiles} JSX files: TypeScript parser absent; use npm run build on installed frontend`);
let absent=[];
for(const [realm,resolve,names] of [['frontend',frontendRequire,['react','react-dom','vite']],['backend',backendRequire,['express']]]){
 for(const name of names){try{resolve.resolve(name)}catch{absent.push(`${realm}/${name}`)}}
}
record('Core JSON/React dependencies',absent.length?'BLOCKED':'AVAILABLE',absent.length?absent.join(', '):'Installed; readiness does not imply successful build');
record('React production build','NOT_RUN','Use npm run build after dependencies are installed');
record('Express HTTP smoke','NOT_RUN','Use npm run smoke after dependencies are installed');
record('PostgreSQL _test acceptance','NOT_RUN','Requires isolated disposable database, safe inventory and explicit ACK via npm run qa:gate:pg');
record('Safari/Android device UAT','NOT_RUN','Physical or hosted devices and hands-on interaction required');
const pkg=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
const report={product:'AUREL Property Workspace',version:pkg.version,scope:'Offline read-only QA only; not production certification',node:process.version,testsPassed:tally,checks:statuses};
writeFileSync(path.join(root,'docs/qa/OFFLINE_EVIDENCE.json'),JSON.stringify(report,null,2)+'\n');
for(const check of statuses)console.log(`${check.status.padEnd(10)} ${check.name} — ${check.detail}`);
console.log('Evidence: docs/qa/OFFLINE_EVIDENCE.json (no credentials or customer records)');
if(statuses.some(c=>c.status==='FAIL'))process.exitCode=1;
