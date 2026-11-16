import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {checkedRecoveryTarget,pgCliEnvironment,quotedRecoverySchema,sha256Bytes,assertBackupDigest} from '../../scripts/pg-recovery-core.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const base={AUREL_STORAGE:'postgres',AUREL_PG_TEST_WRITE_ACK:'yes',PG_SSL:'false',
 AUREL_PG_TEST_DATABASE_URL:'postgresql://aurelqa:password%40private@127.0.0.1:5436/aurel_workspace_test'};

test('V2.75: PG restore target needs explicit acknowledgement, postgres mode and *_test database',()=>{
 assert.throws(()=>checkedRecoveryTarget({...base,AUREL_PG_TEST_WRITE_ACK:''}),/ACK|WRITE_ACK/);
 assert.throws(()=>checkedRecoveryTarget({...base,AUREL_STORAGE:'json'}),/AUREL_STORAGE/);
 assert.throws(()=>checkedRecoveryTarget({...base,AUREL_PG_TEST_DATABASE_URL:'postgresql://qa:password@localhost/aurel'}),/_test/);
 assert.equal(checkedRecoveryTarget(base).target.name,'aurel_workspace_test');
});
test('V2.75: PG restore drill refuses remote servers and connection-option injection',()=>{
 assert.throws(()=>checkedRecoveryTarget({...base,AUREL_PG_TEST_DATABASE_URL:'postgresql://qa:password@remote.example/aurel_workspace_test'}),/local/);
 assert.throws(()=>checkedRecoveryTarget({...base,AUREL_PG_TEST_DATABASE_URL:'postgresql://qa:password@localhost/aurel_workspace_test?options=-csearch_path%3Dpublic'}),/options/);
 assert.throws(()=>checkedRecoveryTarget({...base,AUREL_PG_TEST_DATABASE_URL:'postgresql://qa@localhost/aurel_workspace_test'}),/password/);
});
test('V2.75: pg_dump and pg_restore get a child-only environment without inherited connection overrides',()=>{
 const env=pgCliEnvironment({...base,PGOPTIONS:'-c search_path=unsafe',PGSERVICE:'production',PGHOST:'prod.example',PGDATABASE:'prod',PGUSER:'produser',PGPASSWORD:'prodpass'});
 assert.equal(env.PGDATABASE,'aurel_workspace_test');
 assert.equal(env.PGHOST,'127.0.0.1');
 assert.equal(env.PGPORT,'5436');
 assert.equal(env.PGUSER,'aurelqa');
 assert.equal(env.PGPASSWORD,'password@private');
 assert.equal(env.PGSSLMODE,'disable');
 assert.equal(env.PGOPTIONS,undefined);
 assert.equal(env.PGSERVICE,undefined);
 assert.equal(env.PGAPPNAME,'aurel-recovery-qa');
});
test('V2.75: recovery SQL schema names must be unique-shape identifiers with no interpolation',()=>{
 assert.equal(quotedRecoverySchema('aurel_recovery_qa_0123456789abcdef'),'"aurel_recovery_qa_0123456789abcdef"');
 for(const s of ['public','aurel_recovery_qa_abc','aurel_recovery_qa_0123456789abcdeF','aurel_recovery_qa_0123456789abcdef";DROP SCHEMA public;--'])
  assert.throws(()=>quotedRecoverySchema(s),/Unapproved/);
});
test('V2.75: restored archive must be identical to the approved checksum before any restore',()=>{
 const folder=mkdtempSync(path.join(tmpdir(),'aurel-qa-digest-'));
 try{const file=path.join(folder,'snapshot.dump');const bytes=Buffer.from('PGDMP demo bytes');writeFileSync(file,bytes);
  const digest=sha256Bytes(bytes);assert.doesNotThrow(()=>assertBackupDigest(file,digest));
  writeFileSync(file,Buffer.concat([bytes,Buffer.from('altered')]));
  assert.throws(()=>assertBackupDigest(file,digest),/SHA-256 mismatch/);
 }finally{rmSync(folder,{force:true,recursive:true})}
});
test('V2.75: safety failures block the runner before attempting any CLI or database connection',()=>{
 const p=spawnSync(process.execPath,['scripts/qa-pg-recovery.mjs'],{cwd:root,encoding:'utf8',timeout:10000,
  env:{...process.env,...base,AUREL_PG_TEST_DATABASE_URL:'postgresql://qa:pass@production.example/aurel_workspace_test'}});
 assert.equal(p.status,2,p.stderr);
 assert.match(p.stderr,/loopback|localhost|requires a local/);
 assert.doesNotMatch(p.stderr,/pass@production/);
});
test('V2.75: package, CI and integration gate invoke isolated restore only after PostgreSQL checks',()=>{
 const pkg=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
 assert.match(pkg.version,/^2\.\d+\.0$/);
 assert.equal(pkg.scripts['qa:recovery:pg'],'node --env-file-if-exists=.env scripts/qa-pg-recovery.mjs');
 const gate=readFileSync(path.join(root,'scripts/qa-gate.mjs'),'utf8');
 assert.ok(gate.indexOf("['run','qa:recovery:pg']")<gate.indexOf("['run','smoke:pg']"),'Recovery must run before HTTP smoke leaves QA records');
 assert.match(gate,/if\(!failures\.length\)await run\('Disposable PostgreSQL pg_dump/);
 const script=readFileSync(path.join(root,'scripts/qa-pg-recovery.mjs'),'utf8');
 for(const required of ['inspectDisposablePg','pg_dump','pg_restore','--schema=','assertBackupDigest','DROP SCHEMA','--single-transaction'])assert.ok(script.includes(required),required);
 const workflow=readFileSync(path.join(root,'.github/workflows/integration-acceptance.yml'),'utf8');
 assert.match(workflow,/postgresql-client-16/);
});
