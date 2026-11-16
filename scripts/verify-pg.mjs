import {disposablePgTarget} from './pg-test-config.mjs';
import {loadMigrations,migrationPlan} from '../backend/src/migration-core.js';
import {fileURLToPath} from 'node:url';
/** Read-only PostgreSQL schema readiness check. No writes and no credentials printed. */
const required={
 projects:[], buildings:['project_id'], floors:['project_id'], rooms:['project_id'], units:['project_id'], leases:['unit_id'],
 payment_schedules:['unit_id','lease_id'], payments:['unit_id','lease_id'],
 deposit_transactions:['unit_id','lease_id'], fee_history:['unit_id'],
 audit_logs:[], app_users:[], app_sessions:[], app_settings:['key','value'],
 reminder_contacts:['unit_id','lease_id'], deposit_settlements:['unit_id','lease_id'],
 reminder_notifications:['unit_id','lease_id'], payment_attachments:['unit_id','lease_id'],
 staff:[], clients:[]
};
const testTarget=process.argv.includes('--test-target');
let connectionString=process.env.DATABASE_URL,expectedName=null;
if(testTarget){
 try{const target=disposablePgTarget(process.env);connectionString=target.url;expectedName=target.name}
 catch(error){console.error('PostgreSQL test target BLOCKED:',error.message);process.exit(2)}
}else if(process.env.AUREL_STORAGE!=='postgres'||!connectionString){
 console.error('Set AUREL_STORAGE=postgres and DATABASE_URL for read-only schema verification.');process.exit(2);
}
let pg;try{pg=await import('pg')}catch{console.error('Missing pg package. Run npm install before verifying.');process.exit(2)}
const pool=new pg.Pool({connectionString,ssl:process.env.PG_SSL==='true'?{rejectUnauthorized:true}:undefined,max:1,connectionTimeoutMillis:5000});
let client;let failures=[];
try{
 client=await pool.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const result=await client.query(`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=current_schema()`);
 const tables=new Map();for(const row of result.rows){if(!tables.has(row.table_name))tables.set(row.table_name,new Set());tables.get(row.table_name).add(row.column_name)}
 for(const [table,more] of Object.entries(required)){
  const columns=tables.get(table);if(!columns){failures.push('Missing table: '+table);continue}
  const must=table==='app_settings'?['key','value']:['id','data','project_id','unit_id','lease_id',...more];
  for(const col of must)if(!columns.has(col))failures.push(`Missing column: ${table}.${col}`);
 }
 // Schema presence alone is not sufficient: detect changed or missing SQL migrations.
 if(!tables.has('aurel_schema_migrations'))failures.push('Missing migration history; run db:migrate first');
 else{
  const manifest=await loadMigrations(fileURLToPath(new URL('../database/migrations/',import.meta.url)));
  const records=await client.query('SELECT filename,sha256 FROM aurel_schema_migrations ORDER BY filename');
  try{
   const plan=migrationPlan(manifest,records.rows);
   if(plan.todo.length)failures.push('Pending migrations: '+plan.todo.map(m=>m.filename).join(', '));
  }catch(error){failures.push('Migration drift: '+error.message)}
 }
 const info=await client.query('SELECT current_database() AS database, current_schema() AS schema');
 if(testTarget&&info.rows[0].database!==expectedName)failures.push('Test database identity mismatch');
 console.log('PostgreSQL check:',testTarget?'dedicated _test database':'read-only configured database','schema:',info.rows[0].schema);
 console.log('Tables:',Object.keys(required).length,'required; issues:',failures.length);
 for(const issue of failures)console.error(' - '+issue);
 await client.query('COMMIT');
}catch(err){console.error('Database verification failed:',err.message);failures.push('Connection / schema query failure');try{if(client)await client.query('ROLLBACK')}catch{}}
finally{client?.release();await pool.end()}
if(failures.length)process.exitCode=1;else console.log('Schema readiness PASS (read-only). This does NOT verify frontend, API or real transactions.');
