import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectDisposablePg,QA_TABLE_NAMES} from '../../scripts/pg-test-inventory.mjs';
import {disposablePgTarget} from '../../scripts/pg-test-config.mjs';

const m=[{filename:'001_core.sql',sql:'SELECT 1;',sha256:'a'.repeat(64)},{filename:'002_more.sql',sql:'SELECT 2;',sha256:'b'.repeat(64)}];
function db({name='aurel_workspace_test',schema='public',tables=[],counts={},ledger=[]}={}){
 const queries=[];
 return {queries,async query(sql){queries.push(sql);
  if(sql.includes('current_database()'))return {rows:[{db:name,schema}]};
  if(sql.includes('information_schema.tables'))return {rows:tables.map(item=>typeof item==='string'?{table_schema:'public',table_name:item}:item)};
  if(sql.includes('COUNT(*)::bigint')){
   const t=sql.match(/FROM "([^"]+)"/)?.[1];
   return {rows:[{n:String(counts[t]??0)}]};
  }
  if(sql.includes('SELECT filename,sha256'))return {rows:ledger};
  throw Error('Unexpected query: '+sql);
 }};
}
const scan=(client)=>inspectDisposablePg(client,{expectedName:'aurel_workspace_test',migrations:m});

test('V2.13 read-only inspection admits a new empty disposable database',async()=>{
 const client=db(),result=await scan(client);
 assert.equal(result.safe,true);assert.deepEqual(result.issues,[]);
 assert.ok(client.queries.every(q=>/^SELECT\s/i.test(q)),'QA inventory must use SELECT statements only');
});
test('V2.13 read-only inspection allows matching applied migration prefix without business rows',async()=>{
 const client=db({tables:['projects','aurel_schema_migrations'],ledger:[{filename:m[0].filename,sha256:m[0].sha256}]});
 assert.equal((await scan(client)).safe,true);
});
test('V2.13 refuses wrong DB name before inspecting business rows',async()=>{
 const client=db({name:'aurel_production'}),res=await scan(client);
 assert.equal(res.safe,false);assert.match(res.issues.join(' '),/identity/);
 assert.equal(client.queries.length,1);
});
test('V2.13 refuses a different PostgreSQL schema',async()=>{
 const client=db({schema:'private_tenant'}),res=await scan(client);
 assert.equal(res.safe,false);assert.match(res.issues.join(' '),/public schema/);
 assert.equal(client.queries.length,1);
});
test('V2.13 refuses existing tables in a second user-owned schema',async()=>{
 const client=db({tables:[{table_schema:'tenant_private',table_name:'client_records'}]});
 const res=await scan(client);
 assert.equal(res.safe,false);assert.match(res.issues.join(' '),/Additional user-owned schemas/);
 assert.ok(!client.queries.some(q=>q.includes('client_records')));
});
test('V2.13 refuses unexpected tables even if they look empty',async()=>{
 const res=await scan(db({tables:['projects','customer_secrets']}));
 assert.equal(res.safe,false);assert.match(res.issues.join(' '),/customer_secrets/);
});
test('V2.13 refuses any existing business rows, preventing re-use of a populated test DB',async()=>{
 const client=db({tables:['projects','payments'],counts:{projects:1,payments:1}}),res=await scan(client);
 assert.equal(res.safe,false);assert.match(res.issues.join(' '),/projects/);assert.match(res.issues.join(' '),/payments/);
 assert.ok(client.queries.every(q=>/^SELECT\s/i.test(q)));
});
test('V2.13 refuses mutated migration history before migration writes',async()=>{
 const client=db({tables:['aurel_schema_migrations'],ledger:[{filename:'001_core.sql',sha256:'x'.repeat(64)}]}),res=await scan(client);
 assert.equal(res.safe,false);assert.match(res.issues.join(' '),/Migration history inconsistent/);
});
test('V2.13 refuses out-of-order migration history before any SQL is applied',async()=>{
 const res=await scan(db({tables:['aurel_schema_migrations'],ledger:[{filename:m[1].filename,sha256:m[1].sha256}]}));
 assert.equal(res.safe,false);assert.match(res.issues.join(' '),/Out-of-order/);
});
test('V2.13 known business tables are statically white-listed, never interpolated from server table names',async()=>{
 assert.ok(QA_TABLE_NAMES.includes('payment_attachments'));
 assert.ok(QA_TABLE_NAMES.includes('app_settings'));
 assert.ok(!QA_TABLE_NAMES.includes('customer_secrets'));
 const client=db({tables:['projects','customer_secrets']});await scan(client);
 assert.ok(!client.queries.some(q=>q.includes('FROM "customer_secrets"')));
});
test('V2.13 rejects PostgreSQL test connection without explicit ack and _test suffix',()=>{
 const env={AUREL_STORAGE:'postgres',AUREL_PG_TEST_WRITE_ACK:'yes',AUREL_PG_TEST_DATABASE_URL:'postgresql://localhost:5436/aurel_workspace_test'};
 assert.equal(disposablePgTarget(env).name,'aurel_workspace_test');
 assert.throws(()=>disposablePgTarget({...env,AUREL_PG_TEST_WRITE_ACK:''}));
 assert.throws(()=>disposablePgTarget({...env,AUREL_PG_TEST_DATABASE_URL:'postgresql://localhost/aurel'}));
});
test('V2.13 QA gate runs read-only inspection BEFORE migrations, PostgreSQL smoke only AFTER schema verification',()=>{
 const src=readFileSync(new URL('../../scripts/qa-gate.mjs',import.meta.url),'utf8');
 const a=src.indexOf("['run','qa:pg:inspect']"),b=src.indexOf("['run','db:migrate:test']"),c=src.indexOf("['run','pg:verify'");
 const d=src.indexOf("['run','smoke:pg']");
 assert.ok(a>0&&a<b&&b<c&&c<d);
});
test('V2.13 Docker QA PostgreSQL is opt-in, loopback-only and uses no persistent volume',()=>{
 const src=readFileSync(new URL('../../docker-compose.yml',import.meta.url),'utf8');
 const qa=src.split('  db-test:\n')[1]?.split('\nvolumes:')[0];
 assert.ok(qa);
 assert.match(qa,/profiles: \["qa"\]/);
 assert.match(qa,/127\.0\.0\.1:5436:5432/);
 assert.match(qa,/tmpfs:/);
 assert.doesNotMatch(qa,/aurel_pgdata/);
});
