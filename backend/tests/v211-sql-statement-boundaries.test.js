import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadMigrations,applyMigrations,transactionalMigrationSql,topLevelSqlStatements} from '../src/migration-core.js';

const folder=fileURLToPath(new URL('../../database/migrations/',import.meta.url));
const fake=(sql)=>({filename:'006_qa.sql',sql,sha256:createHash('sha256').update(sql).digest('hex')});
const client=()=>({calls:[],async query(sql){this.calls.push(sql);return {rows:[]}}});

const unsafe=[
 'CREATE TABLE t(id int); COMMIT;',
 'SELECT 1; /*injected*/ ROLLBACK;',
 'BEGIN; SELECT 1; COMMIT; END;',
 'BEGIN; SAVEPOINT x; SELECT 1; COMMIT;',
 'BEGIN; SELECT 1; COMMIT; COMMIT;',
 'BEGIN; SELECT 1; COMMIT; -- ok\n START TRANSACTION;',
 'BEGIN; SELECT 1; COMMIT; -- ok\n ABORT;',
 'BEGIN; SELECT 1; COMMIT; -- ok\n PREPARE TRANSACTION \'x\';',
 'BEGIN; SELECT 1; COMMIT; -- ok\n RELEASE SAVEPOINT x;',
 'BEGIN; SELECT 1; COMMIT; -- ok\n END TRANSACTION;',
 'BEGIN; SELECT 1; COMMIT; -- ok\n COMMIT AND CHAIN;',
 'BEGIN; COMMIT;'
];
test('V2.11 reject transaction directives even after another statement on the same line',async()=>{
 for(const sql of unsafe){
  const db=client();
  await assert.rejects(()=>applyMigrations(db,[fake(sql)]),/Unsafe transaction boundary/,sql);
  assert.equal(db.calls.length,0,'No database statement should execute on unsafe migration');
 }
});

test('V2.11 ignores transaction keywords inside single/double quoted and dollar-quoted text',()=>{
 const sql=`CREATE TABLE t(id int, description text);\nINSERT INTO t(description) VALUES ('COMMIT; ROLLBACK;'), ('BEGIN;');\nDO $code$ BEGIN RAISE NOTICE 'COMMIT;'; END; $code$;\nSELECT "COMMIT" FROM t;`;
 const stmts=topLevelSqlStatements(sql);
 assert.equal(stmts.length,4);
 assert.equal(transactionalMigrationSql(sql),sql);
});

test('V2.11 ignores nested comments and preserves source SQL body without checksum change',()=>{
 const sql=`-- intro\n/* outer /* inner COMMIT; */ outer */\nBEGIN; -- legacy\nCREATE TABLE t(x text); /* COMMIT; */\nINSERT INTO t VALUES ('END;');\nCOMMIT; -- end`;
 const item=fake(sql),body=transactionalMigrationSql(sql);
 assert.match(body,/CREATE TABLE t/);
 assert.match(body,/INSERT INTO t/);
 assert.doesNotMatch(body,/^\s*COMMIT\s*;/m);
 assert.equal(item.sha256,createHash('sha256').update(sql).digest('hex'));
});

test('V2.11 recognizes multiple statements on one line while preserving safe wrapper',()=>{
 const sql='BEGIN; CREATE TABLE t(id int); INSERT INTO t VALUES (1); COMMIT;';
 const stmts=topLevelSqlStatements(sql);
 assert.equal(stmts.length,4);
 assert.equal(transactionalMigrationSql(sql),'CREATE TABLE t(id int); INSERT INTO t VALUES (1);');
});

test('V2.11 supports tagged dollar quotes with semicolons and transaction words',()=>{
 const sql='DO $tag$ BEGIN EXECUTE \'SELECT 1; COMMIT;\'; END; $tag$; SELECT 1;';
 assert.equal(topLevelSqlStatements(sql).length,2);
 assert.equal(transactionalMigrationSql(sql),sql);
});

test('V2.11 accepts E-string backslash-escaped quote with semicolon',()=>{
 const sql=String.raw`SELECT E'esc\\'aped; COMMIT;'; SELECT 2;`;
 // This string deliberately has an ambiguous double-backslash before a quote;
 // only well-formed PostgreSQL string literals should pass safely.
 assert.throws(()=>topLevelSqlStatements(sql),/Unclosed SQL quoted literal/);
 const safe=String.raw`SELECT E'esc\'aped; COMMIT;'; SELECT 2;`;
 assert.equal(topLevelSqlStatements(safe).length,2);
});

test('V2.11 rejects unterminated comments, strings, dollar quotes before database access',async()=>{
 const invalid=['SELECT 1; /* unclosed','SELECT \'unclosed','DO $fn$ BEGIN SELECT 1; END;'];
 for(const sql of invalid){
  const db=client();await assert.rejects(()=>applyMigrations(db,[fake(sql)]),/Unclosed SQL/);
  assert.equal(db.calls.length,0);
 }
});

test('V2.11 validates historical SQL file boundaries without editing released checksums',async()=>{
 const manifest=await loadMigrations(folder);
 assert.equal(manifest.length,5);
 for(const m of manifest){
  const body=transactionalMigrationSql(m.sql,m.filename);
  assert.ok(body.includes('CREATE TABLE'),m.filename);
  assert.equal(topLevelSqlStatements(body).filter(s=>/^(?:BEGIN|COMMIT|ROLLBACK|END|START|ABORT|SAVEPOINT|RELEASE|PREPARE)\b/i.test(s.code)).length,0);
  assert.match(m.sha256,/^[a-f0-9]{64}$/);
 }
});

test('V2.11 PostgreSQL atomic smoke refuses invalid database before pg import',()=>{
 const script=fileURLToPath(new URL('../../scripts/qa-pg-atomic.mjs',import.meta.url));
 const run=spawnSync(process.execPath,[script],{encoding:'utf8',env:{...process.env,AUREL_STORAGE:'postgres',AUREL_PG_TEST_DATABASE_URL:'postgresql://u:secret@localhost:5432/aurel_production',AUREL_PG_TEST_WRITE_ACK:'yes'}});
 assert.equal(run.status,2);
 assert.match(run.stderr,/BLOCKED/);
 assert.doesNotMatch(run.stderr,/secret/);
});

test('V2.11 main PostgreSQL QA gate runs the real rollback exercise before HTTP smoke',async()=>{
 const {readFile}=await import('node:fs/promises');
 const root=new URL('../../',import.meta.url);
 const pkg=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
 const gate=await readFile(new URL('scripts/qa-gate.mjs',root),'utf8');
 assert.equal(pkg.scripts['qa:pg:atomic'],'node --env-file-if-exists=.env scripts/qa-pg-atomic.mjs');
 assert.match(pkg.scripts['qa:migrations'],/v211-sql-statement-boundaries/);
 assert.ok(gate.indexOf("['run','qa:pg:atomic']") < gate.indexOf("['run','smoke:pg']"));
 assert.match(gate,/if\(!failures.length\)await run\('PostgreSQL read-only schema check'/);
});
