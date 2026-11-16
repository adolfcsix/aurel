/** Guard for the *disposable* PostgreSQL integration target.
 * Pure and dependency-free; rechecked against current_database() after connect.
 */
export function disposablePgTarget(env=process.env,{requireAck=true,requireMode=true}={}){
 if(requireMode&&env.AUREL_STORAGE!=='postgres')throw Error('Set AUREL_STORAGE=postgres for PostgreSQL integration checks');
 if(requireAck&&env.AUREL_PG_TEST_WRITE_ACK!=='yes')throw Error('Explicit AUREL_PG_TEST_WRITE_ACK=yes is required for integration writes');
 if(!env.AUREL_PG_TEST_DATABASE_URL)throw Error('Provide AUREL_PG_TEST_DATABASE_URL (a dedicated empty _test database)');
 let parsed;
 try{parsed=new URL(env.AUREL_PG_TEST_DATABASE_URL)}catch{throw Error('The PostgreSQL test URL is invalid')}
 if(!['postgres:','postgresql:'].includes(parsed.protocol))throw Error('The PostgreSQL test URL must use postgres:// or postgresql://');
 // The QA commands perform real writes. *_test and an ACK are not sufficient
 // when a stale or mistyped URL points to a remote company's database.
 if(!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname.toLowerCase()))
  throw Error('PostgreSQL integration accepts only loopback/localhost _test databases');
 if(parsed.search||parsed.hash)throw Error('PostgreSQL QA URL cannot include connection options or fragments');
 const name=decodeURIComponent(parsed.pathname.slice(1));
 if(!name||!name.toLowerCase().endsWith('_test')||name.includes('/'))throw Error('The disposable PostgreSQL database name must end with _test');
 return {url:env.AUREL_PG_TEST_DATABASE_URL,name};
}
