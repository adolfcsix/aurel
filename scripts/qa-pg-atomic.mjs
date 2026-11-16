/**
 * Real PostgreSQL transaction / migration smoke test, isolated to a random
 * temporary schema in an explicitly acknowledged disposable *_test database.
 * NEVER run against production. Does not access existing application tables.
 */
import {randomBytes,createHash} from 'node:crypto';
import {disposablePgTarget} from './pg-test-config.mjs';
import {applyMigrations} from '../backend/src/migration-core.js';

let target;
try{target=disposablePgTarget(process.env)}
catch(err){console.error('PostgreSQL atomic QA BLOCKED:',err.message);process.exit(2)}

let pg;
try{pg=await import('pg')}
catch{console.error('PostgreSQL atomic QA BLOCKED: install dependencies (npm install) first');process.exit(2)}

const schema='aurel_atomic_qa_'+randomBytes(8).toString('hex');
const quoteIdentifier=(s)=>`"${s.replaceAll('"','""')}"`;
const qSchema=quoteIdentifier(schema);
const client=new pg.Client({connectionString:target.url,connectionTimeoutMillis:5000,
 ssl:process.env.PG_SSL==='true'?{rejectUnauthorized:true}:undefined});
const fake=(name,sql)=>({filename:name,sql,sha256:createHash('sha256').update(sql).digest('hex')});
let created=false,issue=null;
try{
 await client.connect();
 const info=await client.query('SELECT current_database() AS db');
 if(info.rows[0]?.db!==target.name)throw Error('Test database identity mismatch');
 await client.query(`CREATE SCHEMA ${qSchema}`);created=true;
 await client.query(`SET search_path TO ${qSchema}`);
 const verified=await client.query('SELECT current_schema() AS active');
 if(verified.rows[0]?.active!==schema)throw Error('Isolated test schema could not be selected');
 const one=fake('001_atomic_first.sql','BEGIN;\nCREATE TABLE marker (id integer PRIMARY KEY);\nCOMMIT;');
 const broken=fake('002_atomic_broken.sql','BEGIN;\nCREATE TABLE another (id integer);\nSELECT 1 / 0;\nCOMMIT;');
 let failedAsExpected=false;
 try{await applyMigrations(client,[one,broken])}catch(error){
  // We expect an actual PostgreSQL division-by-zero error, not a config/parser failure.
  if(error.code!=='22012')throw Error('Unexpected SQL error during atomic rollback exercise');
  failedAsExpected=true;
 }
 if(!failedAsExpected)throw Error('Broken SQL unexpectedly committed');
 const afterRollback=await client.query("SELECT to_regclass('marker') AS marker, to_regclass('another') AS another, to_regclass('aurel_schema_migrations') AS history");
 if(Object.values(afterRollback.rows[0]||{}).some(Boolean))throw Error('Database contains partially committed migration objects');
 const two=fake('002_atomic_second.sql','BEGIN;\nCREATE TABLE another (id integer);\nCOMMIT;');
 const initial=await applyMigrations(client,[one,two]);
 if(initial.applied!==2||initial.skipped!==0)throw Error('Migration first apply result incorrect');
 const repeat=await applyMigrations(client,[one,two]);
 if(repeat.applied!==0||repeat.skipped!==2)throw Error('Idempotent repeat result incorrect');
 const rows=await client.query('SELECT filename,sha256 FROM aurel_schema_migrations ORDER BY filename');
 if(rows.rows.length!==2||rows.rows[0].sha256!==one.sha256||rows.rows[1].sha256!==two.sha256)
  throw Error('Migration history rows/checksums incorrect');
 console.log('REAL POSTGRESQL QA PASS: atomic rollback, isolated schema, ledger checksums and idempotent retry.');
}catch(err){
 issue=err;
 console.error('REAL POSTGRESQL QA FAIL:',err.code||err.message);
}finally{
 if(created){
  try{
   await client.query('RESET search_path');
   await client.query(`DROP SCHEMA ${qSchema} CASCADE`);
  }catch(err){
   console.error('CLEANUP FAILED for isolated test schema:',schema);
   issue=issue||err;
  }
 }
 try{await client.end()}catch{}
}
if(issue)process.exitCode=1;
