/**
 * Read-only acceptance inventory. The _test suffix alone does not make a
 * database disposable: refuse unknown tables, existing business records,
 * non-public schemas or an inconsistent migration ledger before any writes.
 * Uses only names from the static AUREL schema; it never executes raw names
 * received from PostgreSQL.
 */
import {POSTGRES_TABLE_MAP} from '../backend/src/store.js';
import {migrationPlan} from '../backend/src/migration-core.js';

export const QA_TABLE_NAMES=Object.freeze([...new Set([...Object.values(POSTGRES_TABLE_MAP),'app_settings','aurel_schema_migrations'])].sort());
const QA_KNOWN=new Set(QA_TABLE_NAMES);

export async function inspectDisposablePg(client,{expectedName,migrations}){
 if(typeof expectedName!=='string'||!expectedName.toLowerCase().endsWith('_test'))throw Error('Expected disposable _test database name is required');
 if(!Array.isArray(migrations)||!migrations.length)throw Error('Migration manifest is required for acceptance');
 const issues=[];
 const dbInfo=await client.query('SELECT current_database() AS db, current_schema() AS schema');
 const {db,schema}=dbInfo.rows[0]||{};
 if(db!==expectedName)issues.push('Database identity differs from approved _test target');
 if(schema!=='public')issues.push('Test connection must use the public schema');
 // Fail before inventory queries when the connection targets the wrong database/schema.
 if(issues.length)return {safe:false,issues,tableCount:0};
 const tablesResult=await client.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_type='BASE TABLE' ORDER BY table_schema,table_name");
 const external=tablesResult.rows.filter(row=>row.table_schema!=='public');
 if(external.length)issues.push('Additional user-owned schemas contain tables; use a fresh isolated test database');
 const tables=tablesResult.rows.filter(row=>row.table_schema==='public').map(row=>row.table_name);
 const unknown=tables.filter(name=>!QA_KNOWN.has(name));
 if(unknown.length)issues.push('Unexpected tables exist in the test database: '+unknown.join(', '));
 for(const name of tables){
  if(!QA_KNOWN.has(name)||name==='aurel_schema_migrations')continue;
  // Static whitelist prevents identifier injection.
  const result=await client.query(`SELECT COUNT(*)::bigint AS n FROM "${name}"`);
  const raw=result.rows[0]?.n;
  let count;
  try{count=BigInt(raw)}catch{issues.push('Unable to determine row count for '+name);continue}
  if(count>0n)issues.push('Existing business data in '+name+'; use a fresh disposable test database');
 }
 if(tables.includes('aurel_schema_migrations')){
  const history=await client.query('SELECT filename,sha256 FROM aurel_schema_migrations ORDER BY filename');
  try{migrationPlan(migrations,history.rows)}
  catch(error){issues.push('Migration history inconsistent: '+error.message)}
 }
 return {safe:issues.length===0,issues,tableCount:tables.length};
}
