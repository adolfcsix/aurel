/** Safety gate for the dedicated QA database. Does not write anything. */
import {disposablePgTarget} from './pg-test-config.mjs';
import {inspectDisposablePg} from './pg-test-inventory.mjs';
import {loadMigrations} from '../backend/src/migration-core.js';
import {fileURLToPath} from 'node:url';

let target;
try{target=disposablePgTarget(process.env)}
catch(error){console.error('QA DATABASE BLOCKED:',error.message);process.exit(2)}
let pg;
try{pg=await import('pg')}
catch{console.error('QA DATABASE BLOCKED: install dependencies using npm install');process.exit(2)}
const client=new pg.Client({connectionString:target.url,connectionTimeoutMillis:5000,statement_timeout:15000,
 ssl:process.env.PG_SSL==='true'?{rejectUnauthorized:true}:undefined});
try{
 const migrations=await loadMigrations(fileURLToPath(new URL('../database/migrations/',import.meta.url)));
 await client.connect();
 await client.query('BEGIN READ ONLY');
 const result=await inspectDisposablePg(client,{expectedName:target.name,migrations});
 await client.query('COMMIT');
 if(!result.safe){for(const issue of result.issues)console.error('BLOCK:',issue);process.exitCode=2}
 else console.log(`QA DATABASE PASS: isolated _test / public, ${result.tableCount} known table(s), no business rows, consistent migration history. No writes performed.`);
}catch(error){try{await client.query('ROLLBACK')}catch{}
 console.error('QA DATABASE BLOCKED:',error.code||'Connection / schema inspection failed');process.exitCode=2;
}finally{await client.end().catch(()=>{})}
