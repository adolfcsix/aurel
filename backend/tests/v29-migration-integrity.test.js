import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadMigrations,migrationPlan,applyMigrations} from '../src/migration-core.js';
import {POSTGRES_TABLE_MAP} from '../src/store.js';
import {preflightExitCode} from '../../scripts/preflight-status.mjs';

const folder=fileURLToPath(new URL('../../database/migrations/',import.meta.url));
const fake=(filename='001_demo.sql',sql='CREATE TABLE demo(id text PRIMARY KEY);')=>({filename,sql,sha256:'a'.repeat(64)});

function scriptedClient(initial=[],{failSql=null}={}){
 let entries=structuredClone(initial),pending=null;
 const commands=[];
 return {
  commands,get entries(){return entries},
  async query(sql,params){
   commands.push({sql,params});
   if(sql==='BEGIN'){pending=structuredClone(entries);return {rows:[]}}
   if(sql==='ROLLBACK'){pending=null;return {rows:[]}}
   if(sql==='COMMIT'){entries=pending;pending=null;return {rows:[]}}
   if(sql.startsWith('SELECT filename,sha256'))return {rows:structuredClone(pending)};
   if(sql.startsWith('INSERT INTO aurel_schema_migrations')){pending.push({filename:params[0],sha256:params[1]});return {rows:[]}}
   if(sql===failSql)throw Error('Simulated schema failure');
   return {rows:[]};
  }
 };
}

test('V2.9 manifest covers every current SQL migration in deterministic order with SHA-256',async()=>{
 const migrations=await loadMigrations(folder);
 const disk=(await readdir(folder)).filter(name=>/^\d{3,}_[-_a-zA-Z0-9]+\.sql$/.test(name)).sort();
 assert.deepEqual(migrations.map(m=>m.filename),disk);
 assert.ok(migrations.length>=5);
 for(const item of migrations)assert.match(item.sha256,/^[a-f0-9]{64}$/);
});
test('V2.9 manifest rejects empty migrations',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'aurel-migrations-'));
 try{await writeFile(path.join(dir,'001_empty.sql'),'   ');await assert.rejects(()=>loadMigrations(dir),/Empty/)}
 finally{await rm(dir,{recursive:true,force:true})}
});
test('V2.9 planner applies only missing migrations',()=>{
 const first=fake(),second=fake('002_test.sql','SELECT 2');
 const plan=migrationPlan([first,second],[{filename:first.filename,sha256:first.sha256}]);
 assert.deepEqual(plan.todo,[second]);assert.equal(plan.skipped,1);
});
test('V2.9 planner refuses changed checksum and unknown applied migration',()=>{
 const m=fake();
 assert.throws(()=>migrationPlan([m],[{filename:m.filename,sha256:'b'.repeat(64)}]),/checksum/);
 assert.throws(()=>migrationPlan([m],[{filename:'099_missing.sql',sha256:m.sha256}]),/unknown/);
});
test('V2.9 planner refuses duplicate history entries',()=>{
 const m=fake(),row={filename:m.filename,sha256:m.sha256};
 assert.throws(()=>migrationPlan([m],[row,row]),/Duplicate/);
});
test('V2.9 migration runner locks, applies and records checksum in one transaction',async()=>{
 const migration=fake(),client=scriptedClient();
 const result=await applyMigrations(client,[migration]);
 assert.deepEqual(result,{applied:1,skipped:0});
 assert.deepEqual(client.entries,[{filename:migration.filename,sha256:migration.sha256}]);
 const sql=client.commands.map(c=>c.sql);
 assert.equal(sql[0],'BEGIN');assert.equal(sql[1],'SELECT pg_advisory_xact_lock(945001)');
 assert.ok(sql.indexOf(migration.sql)<sql.indexOf('COMMIT'));
 assert.equal(sql.at(-1),'COMMIT');
});
test('V2.9 migration runner is idempotent when history matches',async()=>{
 const migration=fake(),client=scriptedClient([{filename:migration.filename,sha256:migration.sha256}]);
 const result=await applyMigrations(client,[migration]);
 assert.deepEqual(result,{applied:0,skipped:1});
 assert.ok(!client.commands.some(c=>c.sql===migration.sql));
});
test('V2.9 checksum mismatch aborts before SQL and rolls back',async()=>{
 const migration=fake(),client=scriptedClient([{filename:migration.filename,sha256:'b'.repeat(64)}]);
 await assert.rejects(()=>applyMigrations(client,[migration]),/checksum/);
 assert.deepEqual(client.commands.map(c=>c.sql).slice(-1),['ROLLBACK']);
 assert.ok(!client.commands.some(c=>c.sql===migration.sql));
});
test('V2.9 failed migration rolls back schema ledger and does not commit',async()=>{
 const first=fake(),second=fake('002_bad.sql','INVALID SQL'),client=scriptedClient([],{failSql:second.sql});
 await assert.rejects(()=>applyMigrations(client,[first,second]),/Simulated schema failure/);
 assert.deepEqual(client.entries,[]);
 assert.equal(client.commands.at(-1).sql,'ROLLBACK');
 assert.ok(!client.commands.some(c=>c.sql==='COMMIT'));
});
test('V2.9 destructive SQL execution blocked by invalid disposable target before pg import',()=>{
 const script=fileURLToPath(new URL('../src/migrate.js',import.meta.url));
 const result=spawnSync(process.execPath,[script,'--test-target'],{encoding:'utf8',env:{...process.env,AUREL_STORAGE:'postgres',AUREL_PG_TEST_DATABASE_URL:'postgresql://example:secret@localhost/production',AUREL_PG_TEST_WRITE_ACK:'yes'}});
 assert.equal(result.status,2);
 assert.match(result.stderr,/BLOCKED/);
 assert.doesNotMatch(result.stderr,/example:secret/);
});

test('V2.9 complete PostgreSQL table map exists in numbered migrations',async()=>{
 const migrations=await loadMigrations(folder);
 const allSql=migrations.map(m=>m.sql).join('\n');
 const tables=[...new Set(Object.values(POSTGRES_TABLE_MAP)),'app_settings'];
 for(const table of tables){
  assert.match(allSql,new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${table}\\s*\\(`,'i'),`Missing table DDL: ${table}`);
 }
});

test('V2.9 preflight fails closed on missing dependencies but supports explicit advisory mode',()=>{
 const issues=[{kind:'PASS',name:'Node'},{kind:'BLOCK',name:'Express'}];
 assert.equal(preflightExitCode(issues),2);
 assert.equal(preflightExitCode(issues,{advisory:true}),0);
 assert.equal(preflightExitCode([{kind:'PASS',name:'React'}]),0);
});

test('V2.9 migration loader refuses silently skipped or duplicate SQL releases',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'aurel-migration-names-'));
 try{
  await writeFile(path.join(dir,'001_initial.sql'),'SELECT 1');
  await writeFile(path.join(dir,'bad name.sql'),'SELECT 2');
  await assert.rejects(()=>loadMigrations(dir),/Invalid SQL migration filename/);
  await rm(path.join(dir,'bad name.sql'));
  await writeFile(path.join(dir,'001_another.sql'),'SELECT 3');
  await assert.rejects(()=>loadMigrations(dir),/Duplicate SQL migration sequence/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
