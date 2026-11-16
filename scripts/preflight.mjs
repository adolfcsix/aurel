/** Read-only local readiness checks. Never prints credentials or modifies a database. */
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {preflightExitCode} from './preflight-status.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const backend=createRequire(path.join(root,'backend/package.json'));
const frontend=createRequire(path.join(root,'frontend/package.json'));
const results=[];
function record(kind,name,detail){results.push({kind,name,detail});console.log(`${kind.padEnd(5)} ${name}: ${detail}`)}
const major=Number(process.versions.node.split('.')[0]);
record(major>=22?'PASS':'BLOCK','Node.js',process.version+' (requires >=22)');
for(const [where,req,list] of [['Frontend',frontend,['vite','react','react-dom']],['Backend',backend,['express']]]){
 for(const name of list){try{req.resolve(name);record('PASS',`${where} / ${name}`,'installed')}
 catch{record('BLOCK',`${where} / ${name}`,'missing — run npm install at repository root')}}
}
// DB and XLSX parsers are lazy, optional for disposable JSON/React UAT.
for(const name of ['pg','exceljs']){try{backend.resolve(name);record('PASS',`Optional / ${name}`,'installed')}catch{record(name==='pg'&&process.env.AUREL_STORAGE==='postgres'?'BLOCK':'INFO',`Optional / ${name}`,name==='pg'?'not installed; required for PostgreSQL operations':'not installed; XLSX upload unavailable')}}
const pg=process.env.AUREL_STORAGE==='postgres';
record('INFO','Data mode',pg?'PostgreSQL':'JSON DEMO (not suitable for financial production)');
record('INFO','Root .env',fs.existsSync(path.join(root,'.env'))?'present':'not found (expected for PostgreSQL mode)');
if(pg){record(process.env.DATABASE_URL?'PASS':'BLOCK','DATABASE_URL',process.env.DATABASE_URL?'configured (hidden)':'not set');
 record(process.env.ADMIN_INITIAL_PASSWORD?'PASS':'WARN','ADMIN_INITIAL_PASSWORD',process.env.ADMIN_INITIAL_PASSWORD?'configured (hidden)':'not set: initial administrator may not exist');}
record('INFO','Integration status','Preflight checks installation only; run npm run build, npm run smoke and pg:verify for actual verification');
process.exitCode=preflightExitCode(results,{advisory:process.argv.includes('--advisory')});
if(process.exitCode)console.error('NOT READY: one or more prerequisites are missing. No integration test was performed.');
