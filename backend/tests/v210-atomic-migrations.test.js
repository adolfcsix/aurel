import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadMigrations,migrationPlan,applyMigrations,transactionalMigrationSql} from '../src/migration-core.js';

const folder=fileURLToPath(new URL('../../database/migrations/',import.meta.url));
const fake=(filename,sql)=>({filename,sql,sha256:createHash('sha256').update(sql).digest('hex')});
function clientWithRollback({failOn=null}={}){
 let committed=[];let pending=null;
 const calls=[];
 return {
  calls,get committed(){return committed},
  async query(sql,params){
   calls.push({sql,params});
   if(sql==='BEGIN'){assert.equal(pending,null,'nested BEGIN');pending=structuredClone(committed);return {rows:[]}}
   if(sql==='COMMIT'){assert.notEqual(pending,null);committed=pending;pending=null;return {rows:[]}}
   if(sql==='ROLLBACK'){pending=null;return {rows:[]}}
   if(sql.startsWith('SELECT filename,sha256'))return {rows:structuredClone(pending)};
   if(sql.startsWith('INSERT INTO aurel_schema_migrations')){pending.push({filename:params[0],sha256:params[1]});return {rows:[]}}
   if(sql===failOn)throw Error('simulated SQL error');
   return {rows:[]};
  }
 };
}

test('V2.10 all five historical SQL files have an outer wrapper but execute without internal BEGIN/COMMIT',async()=>{
 const manifest=await loadMigrations(folder),client=clientWithRollback();
 assert.equal(manifest.length,5);
 for(const m of manifest){
  assert.match(m.sql,/\bBEGIN\s*;/i);
  assert.match(m.sql,/\bCOMMIT\s*;/i);
  const code=transactionalMigrationSql(m.sql,m.filename);
  assert.doesNotMatch(code,/^\s*(BEGIN|COMMIT)\s*;/im);
  assert.ok(code.includes('CREATE TABLE'));
 }
 const result=await applyMigrations(client,manifest);
 assert.deepEqual(result,{applied:5,skipped:0});
 assert.equal(client.calls.filter(c=>c.sql==='BEGIN').length,1);
 assert.equal(client.calls.filter(c=>c.sql==='COMMIT').length,1);
 assert.equal(client.calls.filter(c=>c.sql==='SELECT pg_advisory_xact_lock(945001)').length,1);
 for(const m of manifest)assert.ok(client.committed.some(row=>row.filename===m.filename&&row.sha256===m.sha256));
});

test('V2.10 rollback from a failure in later historic SQL preserves no partial migration history',async()=>{
 const first=fake('001_first.sql','-- old release\nBEGIN;\nCREATE TABLE demo(id text);\nCOMMIT;');
 const second=fake('002_second.sql','-- old release\nBEGIN;\nBROKEN DDL;\nCOMMIT;');
 const client=clientWithRollback({failOn:'BROKEN DDL;'});
 await assert.rejects(()=>applyMigrations(client,[first,second]),/simulated SQL error/);
 assert.deepEqual(client.committed,[]);
 assert.equal(client.calls.filter(c=>c.sql==='COMMIT').length,0);
 assert.equal(client.calls.at(-1).sql,'ROLLBACK');
});

test('V2.10 reject unmatched or nested transaction controls before touching database',async()=>{
 const invalid=[
  'BEGIN;\nCREATE TABLE t(id int);',
  'CREATE TABLE t(id int);\nCOMMIT;',
  'BEGIN;\nSAVEPOINT s;\nCREATE TABLE t(id int);\nCOMMIT;',
  'BEGIN;\nCREATE TABLE t(id int);\nROLLBACK;',
  'BEGIN; COMMIT;',
  'BEGIN;\nBEGIN;\nCOMMIT;',
  'BEGIN;\nCREATE TABLE t(id int);\nCOMMIT;\nCREATE TABLE x(id int);'
 ];
 for(const sql of invalid){
  const client=clientWithRollback();
  await assert.rejects(()=>applyMigrations(client,[fake('001_invalid.sql',sql)]),/Unsafe transaction/);
  assert.equal(client.calls.length,0,'Must reject before sending any SQL');
 }
});

test('V2.10 native atomic SQL without wrappers still executes and retains original checksum',async()=>{
 const sql='-- Modern release\nCREATE TABLE example(id text);';
 const item=fake('006_native.sql',sql),client=clientWithRollback();
 assert.equal(transactionalMigrationSql(sql),sql);
 await applyMigrations(client,[item]);
 assert.equal(client.committed[0].sha256,createHash('sha256').update(sql).digest('hex'));
});

test('V2.10 source SQL bytes and SHA-256 manifest remain unchanged from historical release',async()=>{
 const migrations=await loadMigrations(folder);
 for(const [index,migration] of migrations.entries()){
  const disk=await readFile(fileURLToPath(new URL(`../../database/migrations/${migration.filename}`,import.meta.url)));
  assert.equal(migration.sha256,createHash('sha256').update(disk).digest('hex'));
  // Ledger history is always a consecutive prefix; a later applied migration
  // with missing predecessors is now intentionally rejected (V2.12).
  const prefix=migrations.slice(0,index+1).map(({filename,sha256})=>({filename,sha256}));
  assert.equal(migrationPlan(migrations,prefix).skipped,index+1);
 }
});
