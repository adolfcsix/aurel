import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadMigrations,migrationPlan,applyMigrations} from '../src/migration-core.js';

const migration=(filename)=>({filename,sql:'SELECT 1;',sha256:'a'.repeat(64)});
const list=[migration('001_initial.sql'),migration('002_owners.sql'),migration('003_rent.sql')];
const applied=(m)=>({filename:m.filename,sha256:m.sha256});
function dbWithHistory(rows){
 const calls=[];
 return {calls,async query(sql){
  calls.push(sql);
  if(sql.startsWith('SELECT filename,sha256 FROM aurel_schema_migrations'))return {rows};
  return {rows:[]};
 }};
}

test('V2.12 migration planner accepts a complete applied prefix and schedules only later migrations',()=>{
 assert.deepEqual(migrationPlan(list,[]).todo,list);
 assert.deepEqual(migrationPlan(list,[applied(list[0])]).todo,list.slice(1));
 assert.deepEqual(migrationPlan(list,list.map(applied)),{todo:[],skipped:3});
});

test('V2.12 rejects an applied migration when the first migration is missing',()=>{
 assert.throws(()=>migrationPlan(list,[applied(list[1])]),/Out-of-order migration history.*002.*001/);
 assert.throws(()=>migrationPlan(list,[applied(list[2])]),/Out-of-order migration history.*003.*001/);
});

test('V2.12 rejects gaps in an otherwise valid migration history',()=>{
 assert.throws(()=>migrationPlan(list,[applied(list[0]),applied(list[2])]),/Out-of-order migration history.*003.*002/);
});

test('V2.12 fails closed and rolls back before executing missing SQL on a history gap',async()=>{
 const db=dbWithHistory([applied(list[0]),applied(list[2])]);
 await assert.rejects(()=>applyMigrations(db,list),/Out-of-order migration history/);
 assert.equal(db.calls[0],'BEGIN');
 assert.equal(db.calls.at(-1),'ROLLBACK');
 assert.equal(db.calls.includes('SELECT 1;'),false,'No historical SQL should execute');
 assert.equal(db.calls.some(q=>q.startsWith('INSERT INTO aurel_schema_migrations')),false);
 assert.equal(db.calls.includes('COMMIT'),false);
});

test('V2.12 migration loader sorts numeric sequences beyond 999 correctly',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'aurel-ordered-migrations-'));
 try{
  for(const n of ['1000_four_digits.sql','999_three_digits.sql','010_mid.sql'])
   await writeFile(path.join(dir,n),'SELECT 1;');
  const manifest=await loadMigrations(dir);
  assert.deepEqual(manifest.map(m=>m.filename),['010_mid.sql','999_three_digits.sql','1000_four_digits.sql']);
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('V2.12 migration loader rejects numeric sequence aliases 001 and 0001',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'aurel-alias-migrations-'));
 try{
  await writeFile(path.join(dir,'001_first.sql'),'SELECT 1;');
  await writeFile(path.join(dir,'0001_duplicate.sql'),'SELECT 2;');
  await assert.rejects(()=>loadMigrations(dir),/Duplicate SQL migration sequence/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
