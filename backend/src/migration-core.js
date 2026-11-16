/**
 * PostgreSQL migration planner and transactional applier.
 * Dependency-free: tested with a scripted client without connecting to production.
 * Applied migrations are immutable; edit the schema with a NEW numbered SQL file.
 */
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const MIGRATION_FILE=/^\d{3,}_[-_a-zA-Z0-9]+\.sql$/;
export async function loadMigrations(directory){
 const entries=await fs.readdir(directory);
 const malformed=entries.filter(name=>name.toLowerCase().endsWith('.sql')&&!MIGRATION_FILE.test(name));
 if(malformed.length)throw Error('Invalid SQL migration filename: '+malformed[0]);
 const files=entries.filter(name=>MIGRATION_FILE.test(name));
 if(!files.length)throw Error('No SQL migrations found');
 // Compare numeric sequence IDs, not lexically: 1000 must come after 999.
 // Canonical numeric IDs also reject aliases like 001 and 0001.
 const sequenceOf=filename=>BigInt(filename.split('_',1)[0]);
 const numbers=new Set();
 for(const filename of files){
  const sequence=sequenceOf(filename).toString();
  if(numbers.has(sequence))throw Error('Duplicate SQL migration sequence: '+sequence);
  numbers.add(sequence);
 }
 files.sort((a,b)=>sequenceOf(a)<sequenceOf(b)?-1:sequenceOf(a)>sequenceOf(b)?1:0);
 const migrations=[];
 for(const filename of files){
  const sql=await fs.readFile(path.join(directory,filename),'utf8');
  if(!sql.trim())throw Error(`Empty SQL migration: ${filename}`);
  migrations.push({filename,sql,sha256:createHash('sha256').update(sql).digest('hex')});
 }
 return migrations;
}
export function migrationPlan(migrations,appliedRows){
 const applied=new Map();
 for(const row of appliedRows){
  if(applied.has(row.filename))throw Error('Duplicate migration history entry: '+row.filename);
  applied.set(row.filename,row.sha256);
 }
 const known=new Set(migrations.map(m=>m.filename));
 for(const name of applied.keys())if(!known.has(name))throw Error('Database contains an unknown migration: '+name);
 const todo=[];
 let firstMissing=null;
 for(const migration of migrations){
  const existing=applied.get(migration.filename);
  if(existing!==undefined&&existing!==migration.sha256)
   throw Error('Migration checksum differs from database: '+migration.filename);
  if(existing===undefined){
   firstMissing??=migration.filename;
   todo.push(migration);
  }else if(firstMissing!==null){
   // An applied migration after a gap means the database was partially
   // upgraded or an old SQL file was inserted retrospectively. Running the
   // earlier file now can damage existing data; require manual reconciliation.
   throw Error(`Out-of-order migration history: ${migration.filename} was applied after missing ${firstMissing}`);
  }
 }
 return {todo,skipped:migrations.length-todo.length};
}
/**
 * Lexically split top-level SQL statements without treating semicolons inside
 * strings, nested comments, quoted identifiers, or PostgreSQL dollar-quoted
 * function bodies as statement boundaries.
 *
 * This is a deliberately conservative transaction-control guard; it is NOT a
 * full SQL parser or a substitute for an actual PostgreSQL migration test.
 */
export function topLevelSqlStatements(sql,filename='migration'){
 if(typeof sql!=='string'||!sql.trim())throw Error(`Empty SQL migration: ${filename}`);
 const statements=[];
 let start=0, code='', i=0;
 const n=sql.length;
 const appendWhitespace=()=>{code+=' '};
 const emit=(end)=>{
  const normalized=code.trim();
  if(normalized)statements.push({start,end,code:normalized});
  code='';start=end;
 };
 while(i<n){
  const ch=sql[i],next=sql[i+1];
  if(ch==='-'&&next==='-'){
   appendWhitespace();i+=2;
   while(i<n&&sql[i]!=='\n')i++;
   continue;
  }
  if(ch==='/'&&next==='*'){
   const at=i;let depth=1;i+=2;appendWhitespace();
   while(i<n&&depth>0){
    if(sql[i]==='/'&&sql[i+1]==='*'){depth++;i+=2}
    else if(sql[i]==='*'&&sql[i+1]==='/'){depth--;i+=2}
    else i++;
   }
   if(depth)throw Error(`Unclosed SQL block comment in ${filename} near position ${at}`);
   continue;
  }
  if(ch==='\''||ch==='"'){
   const quote=ch,at=i;
   const escaped=quote==='\''&&i>0&&/[eE]/.test(sql[i-1])&&
    (i===1||!/[a-zA-Z0-9_]/.test(sql[i-2]));
   code+='Q';i++;let closed=false;
   while(i<n){
    if(escaped&&sql[i]==='\\'){i+=2;continue}
    if(sql[i]===quote){
     if(sql[i+1]===quote){i+=2;continue}
     i++;closed=true;break;
    }
    i++;
   }
   if(!closed)throw Error(`Unclosed SQL quoted literal in ${filename} near position ${at}`);
   continue;
  }
  if(ch==='$'){
   const matched=sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/);
   if(matched){
    const delimiter=matched[0],at=i;
    i+=delimiter.length;
    const end=sql.indexOf(delimiter,i);
    if(end<0)throw Error(`Unclosed SQL dollar-quoted literal in ${filename} near position ${at}`);
    code+='Q';i=end+delimiter.length;continue;
   }
  }
  code+=ch;
  i++;
  if(ch===';')emit(i);
 }
 emit(n);
 return statements;
}

const TX_CONTROL=/^(?:BEGIN|COMMIT|ROLLBACK|END|ABORT|START|SAVEPOINT|RELEASE|PREPARE)\b/i;
/**
 * Historical 001–005 migrations wrap their SQL in BEGIN/COMMIT. Keep their
 * original SHA-256 identity but remove the outer pair at execution time.
 * Reject any additional top-level transaction-control statement, even when
 * multiple statements appear on one line or comments divide statements.
 */
export function transactionalMigrationSql(sql,filename='migration'){
 const statements=topLevelSqlStatements(sql,filename);
 if(!statements.length)throw Error(`Empty SQL migration: ${filename}`);
 const controls=statements.filter(s=>TX_CONTROL.test(s.code));
 if(!controls.length)return sql;
 const first=statements[0],last=statements.at(-1);
 if(controls.length!==2||controls[0]!==first||controls[1]!==last||
    !/^BEGIN\s*;$/i.test(first.code)||!/^COMMIT\s*;$/i.test(last.code)||
    statements.length<3)
  throw Error(`Unsafe transaction boundary in ${filename}: only a non-empty outer BEGIN/COMMIT pair is allowed`);
 const body=sql.slice(first.end,last.start).trim();
 if(!body)throw Error(`Unsafe transaction boundary in ${filename}: empty transaction body`);
 return body;
}

export async function applyMigrations(client,migrations,{report=()=>{}}={}){
 if(!migrations.length)throw Error('No migrations to apply');
 // Validate *all* files before beginning the database transaction.
 const executable=new Map(migrations.map(m=>[m.filename,transactionalMigrationSql(m.sql,m.filename)]));
 await client.query('BEGIN');
 try{
  // Share the application advisory lock to prevent writes during schema changes.
  await client.query('SELECT pg_advisory_xact_lock(945001)');
  await client.query(`CREATE TABLE IF NOT EXISTS aurel_schema_migrations (
   filename text PRIMARY KEY,
   sha256 text NOT NULL,
   applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const history=await client.query('SELECT filename,sha256 FROM aurel_schema_migrations ORDER BY filename');
  const {todo,skipped}=migrationPlan(migrations,history.rows);
  for(const migration of todo){
   await client.query(executable.get(migration.filename));
   await client.query('INSERT INTO aurel_schema_migrations(filename,sha256) VALUES ($1,$2)',[migration.filename,migration.sha256]);
   report(`APPLIED ${migration.filename}`);
  }
  await client.query('COMMIT');
  report(`VERIFIED ${skipped} existing; APPLIED ${todo.length} new`);
  return {applied:todo.length,skipped};
 }catch(error){
  try{await client.query('ROLLBACK')}catch{}
  throw error;
 }
}
