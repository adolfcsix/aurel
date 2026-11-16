/**
 * Restricted connection and backup verification for the AUREL PostgreSQL
 * disaster-recovery drill. Nothing here reads or writes database tables.
 * Passwords are passed to postgres CLI through a child-only environment.
 */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {disposablePgTarget} from './pg-test-config.mjs';

export const QA_RECOVERY_SCHEMA=/^aurel_recovery_qa_[0-9a-f]{16}$/;
export function checkedRecoveryTarget(env=process.env){
 const target=disposablePgTarget(env);
 const parsed=new URL(target.url);
 if(!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname.toLowerCase()))
  throw Error('PostgreSQL recovery drill requires a local, disposable _test server');
 if(parsed.search||parsed.hash)throw Error('Recovery test connection URL must not contain options or fragments');
 if(!parsed.username||!parsed.password)throw Error('Recovery test requires its own username and password');
 if(parsed.pathname==='/'||!target.name.toLowerCase().endsWith('_test'))throw Error('Not a disposable _test database');
 if(!Number.isInteger(Number(parsed.port||5432))||Number(parsed.port||5432)<1||Number(parsed.port||5432)>65535)
  throw Error('Invalid PostgreSQL recovery test port');
 return {target,parsed};
}
export function pgCliEnvironment(env=process.env){
 const {target,parsed}=checkedRecoveryTarget(env);
 const childEnv={...env};
 for(const name of ['PGOPTIONS','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGHOSTADDR','PGDATABASE','PGUSER','PGPASSWORD','PGHOST','PGPORT','PGSSLMODE'])delete childEnv[name];
 Object.assign(childEnv,{
  PGHOST:parsed.hostname==='[::1]'?'::1':parsed.hostname,
  PGPORT:parsed.port||'5432',
  PGDATABASE:target.name,
  PGUSER:decodeURIComponent(parsed.username),
  PGPASSWORD:decodeURIComponent(parsed.password),
  PGSSLMODE:env.PG_SSL==='true'?'verify-full':'disable',
  PGCONNECT_TIMEOUT:'5',
  PGAPPNAME:'aurel-recovery-qa',
 });
 return childEnv;
}
export function quotedRecoverySchema(schema){
 if(!QA_RECOVERY_SCHEMA.test(schema))throw Error('Unapproved recovery QA schema identifier');
 return `"${schema}"`;
}
export function sha256Bytes(bytes){return createHash('sha256').update(bytes).digest('hex')}
export function assertBackupDigest(file,expected){
 if(!/^[a-f0-9]{64}$/.test(expected)||sha256Bytes(readFileSync(file))!==expected)
  throw Error('Recovery archive SHA-256 mismatch; restore refused');
}
