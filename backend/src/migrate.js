/** Versioned, checksum-checked PostgreSQL schema migrations. */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadMigrations,applyMigrations} from './migration-core.js';
import {disposablePgTarget} from '../../scripts/pg-test-config.mjs';

const testTarget=process.argv.includes('--test-target');
let connectionString=process.env.DATABASE_URL, expectedName='';
if(testTarget){
 try{const target=disposablePgTarget(process.env);connectionString=target.url;expectedName=target.name}
 catch(error){console.error('Schema migration BLOCKED:',error.message);process.exit(2)}
}else if(!connectionString){console.error('Cần đặt DATABASE_URL trước khi migrate');process.exit(2)}

let pg;
try{pg=await import('pg')}catch{console.error('Missing PostgreSQL driver. Run npm install before migrating.');process.exit(2)}
const client=new pg.Client({connectionString,ssl:process.env.PG_SSL==='true'?{rejectUnauthorized:true}:undefined});
try{
 const folder=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../database/migrations');
 const migrations=await loadMigrations(folder);
 await client.connect();
 if(testTarget){
  const result=await client.query('SELECT current_database() AS database');
  if(result.rows[0]?.database!==expectedName)throw Error('Test database identity mismatch');
 }
 const result=await applyMigrations(client,migrations,{report:line=>console.log(line)});
 console.log(`Schema ready: ${result.applied} new migration(s), ${result.skipped} unchanged`);
}catch(error){
 // Do not print DATABASE_URL, query parameters or credentials from driver errors.
 console.error('Schema migration FAILED:',error.code||'Check the database schema and connection settings');
 process.exitCode=1;
}finally{await client.end()}
