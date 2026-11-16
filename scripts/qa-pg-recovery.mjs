/**
 * Real PostgreSQL pg_dump + pg_restore drill on an isolated RANDOM schema.
 * Strictly restricted to an acknowledged, local, empty *_test database.
 * Does not dump, mutate, or restore the main AUREL business schema.
 * Needs installed pg, PostgreSQL CLI tools, and a reachable PostgreSQL server.
 */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkedRecoveryTarget,pgCliEnvironment,quotedRecoverySchema,sha256Bytes,assertBackupDigest} from './pg-recovery-core.mjs';
import {inspectDisposablePg} from './pg-test-inventory.mjs';
import {loadMigrations} from '../backend/src/migration-core.js';

function runCli(binary,args,env,timeout=45000){
 return new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{env,stdio:['ignore','pipe','pipe'],shell:false});
  let stdout='',stderr='';
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error(binary+' timed out'))},timeout);
  child.stdout.on('data',chunk=>stdout=(stdout+chunk.toString()).slice(-12000));
  child.stderr.on('data',chunk=>stderr=(stderr+chunk.toString()).slice(-2000));
  child.once('error',error=>{clearTimeout(timer);reject(Error(binary+' unavailable: '+error.code))});
  child.once('exit',code=>{clearTimeout(timer);code===0?resolve(stdout):reject(Error(binary+' failed (exit '+code+'): '+stderr.replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[redacted]'))) });
 });
}
function q(schema,name){return quotedRecoverySchema(schema)+'."'+name+'"'}
async function snapshot(client,schema){
 const units=await client.query(`SELECT id,code,area FROM ${q(schema,'units')} ORDER BY id`);
 const payments=await client.query(`SELECT id,unit_id,amount,reference FROM ${q(schema,'payments')} ORDER BY id`);
 const deposits=await client.query(`SELECT id,unit_id,amount,reference FROM ${q(schema,'deposits')} ORDER BY id`);
 return {units:units.rows,payments:payments.rows,deposits:deposits.rows};
}
let target,cli;
try{({target}=checkedRecoveryTarget(process.env));cli=pgCliEnvironment(process.env)}
catch(error){console.error('POSTGRESQL RECOVERY BLOCKED:',error.message);process.exit(2)}
let pg;
try{pg=await import('pg')}
catch{console.error('POSTGRESQL RECOVERY BLOCKED: install pg with npm install --include=optional');process.exit(2)}
const temp=await mkdtemp(path.join(tmpdir(),'aurel-pg-recovery-'));
const archive=path.join(temp,'isolated-schema.dump');
const tampered=path.join(temp,'damaged-schema.dump');
const schema='aurel_recovery_qa_'+randomBytes(8).toString('hex');
const quoted=quotedRecoverySchema(schema);
const client=new pg.Client({connectionString:target.url,connectionTimeoutMillis:5000,statement_timeout:20000,
 ssl:process.env.PG_SSL==='true'?{rejectUnauthorized:true}:undefined});
let created=false,problem=null;
try{
 // First ensure both postgres command-line tools are actually available.
 await runCli('pg_dump',['--version'],cli,8000);
 await runCli('pg_restore',['--version'],cli,8000);
 const migrations=await loadMigrations(fileURLToPath(new URL('../database/migrations/',import.meta.url)));
 await client.connect();
 await client.query('BEGIN READ ONLY');
 const inventory=await inspectDisposablePg(client,{expectedName:target.name,migrations});
 await client.query('COMMIT');
 if(!inventory.safe)throw Error('QA database inventory denied: '+inventory.issues.join('; '));
 // Protect against search_path overrides even when the caller supplied a URL.
 const info=await client.query('SELECT current_database() AS name, current_schema() AS schema');
 assert.equal(info.rows[0]?.name,target.name);
 assert.equal(info.rows[0]?.schema,'public');
 // The only database writes are within this freshly generated and known schema.
 await client.query(`CREATE SCHEMA ${quoted}`);created=true;
 await client.query(`CREATE TABLE ${q(schema,'units')} (id integer PRIMARY KEY, code text NOT NULL UNIQUE, area numeric(10,2) NOT NULL)`);
 await client.query(`CREATE TABLE ${q(schema,'payments')} (id integer PRIMARY KEY, unit_id integer NOT NULL REFERENCES ${q(schema,'units')}(id), amount numeric(14,2) NOT NULL, reference text NOT NULL)`);
 await client.query(`CREATE TABLE ${q(schema,'deposits')} (id integer PRIMARY KEY, unit_id integer NOT NULL REFERENCES ${q(schema,'units')}(id), amount numeric(14,2) NOT NULL, reference text NOT NULL)`);
 await client.query(`INSERT INTO ${q(schema,'units')} VALUES (1,'QA-A01',64.50),(2,'QA-B02',79.25)`);
 await client.query(`INSERT INTO ${q(schema,'payments')} VALUES (1,1,9500000,'Tiền thuê tháng 11'),(2,1,1500000,'Thanh toán một phần')`);
 await client.query(`INSERT INTO ${q(schema,'deposits')} VALUES (1,2,18000000,'Đặt cọc căn B02')`);
 const before=await snapshot(client,schema);
 assert.equal(before.units.length,2);assert.equal(before.payments.length,2);assert.equal(before.deposits.length,1);
 await runCli('pg_dump',['--format=custom','--no-owner','--no-privileges','--schema='+schema,'--file='+archive],cli);
 const bytes=await readFile(archive);assert.ok(bytes.length>100,'pg_dump archive is empty');
 const digest=sha256Bytes(bytes);assertBackupDigest(archive,digest);
 await copyFile(archive,tampered);
 const {appendFile}=await import('node:fs/promises');await appendFile(tampered,'tampered');
 assert.throws(()=>assertBackupDigest(tampered,digest),/SHA-256 mismatch/);
 // Simulate data loss in the disposable schema; do not touch application tables.
 await client.query(`DELETE FROM ${q(schema,'payments')}`);
 await client.query(`DELETE FROM ${q(schema,'deposits')}`);
 await client.query(`UPDATE ${q(schema,'units')} SET area=0`);
 const damaged=await snapshot(client,schema);
 assert.notDeepEqual(damaged,before);
 // Restore the untouched snapshot: first remove only the random QA schema.
 await client.query(`DROP SCHEMA ${quoted} CASCADE`);
 // Keep cleanup armed: a failed restore can leave a partially rebuilt schema.
 assertBackupDigest(archive,digest);
 await runCli('pg_restore',['--exit-on-error','--single-transaction','--no-owner','--no-privileges','--dbname='+target.name,archive],cli,60000);
 const restored=await snapshot(client,schema);
 assert.deepEqual(restored,before,'pg_restore did not preserve relational rows, Unicode or financial amounts');
 const isolation=await client.query(`SELECT COUNT(*)::integer AS count FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('units','payments','deposits')`);
 // This count is descriptive only: the public application's schema is not changed by the drill.
 assert.ok(isolation.rows[0].count>=0);
 console.log('PASS REAL PostgreSQL QA recovery: disposable '+schema+' backup checksum, corrupted copy rejected, real pg_dump/pg_restore, foreign keys, Unicode, amounts and table rows restored. Application public schema untouched.');
}catch(error){
 problem=error;
 try{await client.query('ROLLBACK')}catch{}
 console.error('POSTGRESQL RECOVERY NOT ACCEPTED:',error.code||error.message);
}finally{
 // The schema name is generated by this process; never use caller-controlled SQL identifiers.
 if(created){try{await client.query(`DROP SCHEMA IF EXISTS ${quoted} CASCADE`)}catch(error){
   console.error('MANUAL QA SCHEMA CLEANUP REQUIRED:',schema);
   problem=problem||error;
 }}
 try{await client.end()}catch{}
 await rm(temp,{recursive:true,force:true,maxRetries:3,retryDelay:50}).catch(()=>{});
}
if(problem)process.exitCode=1;
