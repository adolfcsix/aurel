import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {APP_VERSION} from '../src/runtime-version.js';
import {disposablePgTarget} from '../../scripts/pg-test-config.mjs';

const read=(relative)=>readFileSync(new URL(relative,import.meta.url),'utf8');
const makeEnv=(more={})=>({
 AUREL_STORAGE:'postgres',
 AUREL_PG_TEST_WRITE_ACK:'yes',
 AUREL_PG_TEST_DATABASE_URL:'postgresql://localhost:5432/aurel_acceptance_test',
 ...more
});

test('V2.4 API release metadata reads root package version, never a stale hardcoded string',()=>{
 const pkg=JSON.parse(read('../../package.json'));
 assert.equal(APP_VERSION,pkg.version);
 assert.match(pkg.version,/^\d+\.\d+\.\d+$/); // No test-specific version pin: future releases must not break QA.
 assert.match(read('../src/index.js'),/version:APP_VERSION/);
 assert.match(read('../../scripts/smoke.mjs'),/assert\.equal\(health\.version,APP_VERSION/);
});
test('V2.4 PostgreSQL test URL and ACK select an explicitly isolated database',()=>{
 const selected=disposablePgTarget(makeEnv());
 assert.equal(selected.name,'aurel_acceptance_test');
 assert.match(selected.url,/aurel_acceptance_test$/);
});
test('V2.4 PostgreSQL test target refuses production, arbitrary path and non-PostgreSQL URL',()=>{
 for(const address of [
  'postgresql://localhost:5432/aurel_production',
  'postgresql://localhost:5432/aurel_test/another',
  'https://localhost:5432/aurel_test',
  'not-a-postgres-url',
  'postgresql://localhost:5432/',
 ])assert.throws(()=>disposablePgTarget(makeEnv({AUREL_PG_TEST_DATABASE_URL:address})));
});
test('V2.4 PostgreSQL acceptance requires an explicit acknowledgment to permit writing',()=>{
 assert.throws(()=>disposablePgTarget(makeEnv({AUREL_PG_TEST_WRITE_ACK:''})),/ACK/);
 assert.throws(()=>disposablePgTarget(makeEnv({AUREL_STORAGE:'json'})),/AUREL_STORAGE/);
 assert.throws(()=>disposablePgTarget(makeEnv({AUREL_PG_TEST_DATABASE_URL:''})),/AUREL_PG_TEST_DATABASE_URL/);
});
test('V2.4 read-only PostgreSQL verifier supports the same test target as write smoke',()=>{
 const gate=read('../../scripts/qa-gate.mjs');
 const verifier=read('../../scripts/verify-pg.mjs');
 assert.match(gate,/disposablePgTarget\(process\.env\)/);
 assert.match(gate,/\['run','pg:verify','--','--test-target'\]/);
 assert.match(verifier,/disposablePgTarget\(process\.env\)/);
 assert.match(verifier,/Test database identity mismatch/);
});
test('V2.4 PostgreSQL HTTP smoke refuses leftover settings as well as business rows',()=>{
 const smoke=read('../../scripts/smoke.mjs');
 assert.match(smoke,/['"]app_settings['"]/);
 assert.match(smoke,/verifyDisposablePg\(\)/);
 assert.match(smoke,/current_database\(\)/);
});
test('V2.4 backend and frontend keep aligned monorepo versioning',()=>{
 const root=JSON.parse(read('../../package.json'));
 const frontend=JSON.parse(read('../../frontend/package.json'));
 const backend=JSON.parse(read('../package.json'));
 assert.equal(root.version,APP_VERSION);
 assert.equal(frontend.version,APP_VERSION);
 assert.equal(backend.version,APP_VERSION);
 assert.deepEqual(root.workspaces,['frontend','backend']);
});
test('V2.4 read-only pg:verify without test mode stays separate from write smoke',()=>{
 const verifier=read('../../scripts/verify-pg.mjs');
 assert.match(verifier,/const testTarget=process\.argv\.includes\('--test-target'\)/);
 assert.match(verifier,/process\.env\.DATABASE_URL/);
 const gate=read('../../scripts/qa-gate.mjs');
 assert.doesNotMatch(gate,/gate\('DATABASE_URL'/);
});

test('V2.4 PostgreSQL verifier blocks unsafe target before importing any PostgreSQL driver',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/verify-pg.mjs',import.meta.url)),'--test-target'],{
  encoding:'utf8',env:{...process.env,...makeEnv({AUREL_PG_TEST_WRITE_ACK:'',AUREL_PG_TEST_DATABASE_URL:'postgres://user:secret@localhost/production'})}
 });
 assert.equal(result.status,2,result.stderr);
 assert.match(result.stderr,/BLOCKED/);
 assert.doesNotMatch(result.stderr,/user:secret/);
});
test('V2.4 QA gate rejects unsafe PostgreSQL target without attempting integration writes',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/qa-gate.mjs',import.meta.url)),'--postgres'],{
  encoding:'utf8',env:{...process.env,...makeEnv({AUREL_PG_TEST_DATABASE_URL:'postgresql://localhost/production'})}
 });
 assert.equal(result.status,2,result.stderr);
 assert.match(result.stdout,/BLOCK Dedicated disposable PostgreSQL test target/);
 assert.match(result.stderr,/No build, API smoke, or database write attempted/);
});
