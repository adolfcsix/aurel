/**
 * Read-only acceptance report. Does not import, migrate, seed or update any
 * existing data; an explicit demo path is required in JSON mode.
 * No names, addresses, database URLs, or transaction identifiers are logged.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {seed} from '../backend/src/seed.js';
import {upgrade,getDb} from '../backend/src/store.js';
import {scanDataQuality} from '../backend/src/data-quality.js';

const args=new Set(process.argv.slice(2));
const demoSeed=args.has('--demo-seed');
if(args.has('--help')){
 console.log('AUREL data integrity QA (read-only)');
 console.log('npm run qa:integrity:demo    # in-memory sample only');
 console.log('AUREL_DEMO_DATA_DIR=<explicit demo directory> npm run qa:integrity');
 console.log('AUREL_STORAGE=postgres DATABASE_URL=<configured> npm run qa:integrity');
 process.exit(0);
}
try{
 let db,source;
 if(demoSeed){db=upgrade(seed());source='in-memory demonstration';}
 else if(process.env.AUREL_STORAGE==='postgres'){
  if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required for read-only PostgreSQL validation');
  db=await getDb();source='PostgreSQL snapshot (read-only)';
 }else{
  if(!process.env.AUREL_DEMO_DATA_DIR)throw Error('Set AUREL_DEMO_DATA_DIR explicitly; refusing to create or auto-seed a demo database');
  const f=path.join(path.resolve(process.env.AUREL_DEMO_DATA_DIR),'local-demo.json');
  db=JSON.parse(await fs.readFile(f,'utf8'));source='existing JSON demo file (read-only)';
 }
 const result=scanDataQuality(db,{limit:1000});
 console.log(`AUREL data integrity QA — ${source}`);
 console.log(`Reviewed: ${result.summary.units} apartments, ${result.summary.leases} contracts, ${result.summary.schedules} payment periods`);
 console.log(`Result: ${result.summary.critical} critical / ${result.summary.warning} warnings`);
 const grouped=new Map();
 for(const issue of result.issues){const k=`${issue.severity}: ${issue.code}`;grouped.set(k,(grouped.get(k)||0)+1);}
 for(const [code,count] of [...grouped].sort((a,b)=>a[0].localeCompare(b[0])))console.log(`  ${code} (${count})`);
 if(result.truncated)console.log('Additional records were omitted; check the authenticated Data Quality view.');
 if(result.summary.critical)process.exitCode=1;
 else console.log('PASS (read-only integrity scan; not a replacement for PostgreSQL/API/browser acceptance)');
}catch(error){
 console.error(`BLOCKED: ${error instanceof SyntaxError?'Invalid JSON data':error.code==='ENOENT'?'Explicit data file not found':error.code==='MODULE_NOT_FOUND'?'PostgreSQL dependency is missing':error.message}`);
 process.exitCode=2;
}
