/** Read-only payment-evidence audit; never creates, modifies or deletes files. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {seed} from '../backend/src/seed.js';
import {getDb} from '../backend/src/store.js';
import {auditStoredAttachments,auditUnindexedAttachments} from '../backend/src/payment-attachments.js';

const args=new Set(process.argv.slice(2));
if(args.has('--help')){
 console.log('AUREL evidence QA (read-only)');
 console.log('npm run qa:evidence:demo                   # in-memory sample, no real receipts');
 console.log('AUREL_DEMO_DATA_DIR=<path> npm run qa:evidence  # existing local-demo.json');
 console.log('AUREL_STORAGE=postgres DATABASE_URL=<url> npm run qa:evidence # read-only DB');
 process.exit(0);
}
try{
 let data,source;
 if(args.has('--demo-seed')){data=seed();source='demo seed';}
 else if(process.env.AUREL_STORAGE==='postgres'){
  if(!process.env.DATABASE_URL)throw Error('PostgreSQL URL is required');
  data=await getDb();source='PostgreSQL snapshot';
 }else{
  if(!process.env.AUREL_DEMO_DATA_DIR)throw Error('Explicit AUREL_DEMO_DATA_DIR is required');
  const file=path.join(path.resolve(process.env.AUREL_DEMO_DATA_DIR),'local-demo.json');
  data=JSON.parse(await fs.readFile(file,'utf8'));source='existing JSON demo file';
 }
 const report=await auditStoredAttachments(data);
 // An in-memory seed has no associated evidence directory; disk checks would
 // incorrectly compare unrelated real files to an intentionally empty index.
 const physical=args.has('--demo-seed')?{scanned:0,unindexed:0}:await auditUnindexedAttachments(data);
 const {checked,valid,missing,corrupt}=report.summary;
 console.log(`AUREL evidence QA — ${source}: ${checked} indexed / ${valid} verified / ${missing} missing / ${corrupt} invalid / ${physical.unindexed} unindexed on disk`);
 if(report.truncated)console.log('Further evidence errors omitted from this output.');
 if(missing||corrupt||physical.unindexed){
  console.error('FAIL: Payment evidence requires manual recovery and reconciliation (including unindexed files); no files were modified.');process.exitCode=1;
 }else console.log(checked?'PASS: Every indexed attachment was verified against stored SHA-256 and file type.':'NO COVERAGE: No indexed attachments in this dataset.');
}catch(error){
 console.error('BLOCKED:',error.code==='ENOENT'?'The specified local data file does not exist':error.message);
 process.exitCode=2;
}
