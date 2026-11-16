import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {seed} from './seed.js';
import {hashPassword} from './security.js';
import {create, generateSchedules} from './domain.js';
const dir=process.env.AUREL_DEMO_DATA_DIR ? path.resolve(process.env.AUREL_DEMO_DATA_DIR) : path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../data');
const file=path.join(dir,'local-demo.json');
const names=['projects','buildings','floors','rooms','staff','clients','units','leases','schedules','payments','depositTransactions','feeHistory','reminderContacts','reminderNotifications','depositSettlements','paymentAttachments','audit','users','sessions'];
export const POSTGRES_TABLE_MAP=Object.freeze({projects:'projects',buildings:'buildings',floors:'floors',rooms:'rooms',staff:'staff',clients:'clients',units:'units',leases:'leases',schedules:'payment_schedules',payments:'payments',depositTransactions:'deposit_transactions',feeHistory:'fee_history',reminderContacts:'reminder_contacts',reminderNotifications:'reminder_notifications',depositSettlements:'deposit_settlements',paymentAttachments:'payment_attachments',audit:'audit_logs',users:'app_users',sessions:'app_sessions'});
const table=POSTGRES_TABLE_MAP;
let state;let pool;let jsonTail=Promise.resolve();
export function upgrade(db){
 // Schema-v9 records are authoritative; reopening a saved workspace must not
 // re-create contracts, receivables, payments or deposit receipts.
 const legacy=!Number.isInteger(db.version)||db.version<9;
 for(const name of names)if(!Array.isArray(db[name]))db[name]=[];
 if(!legacy)return db;
 if(!db.users.length&&process.env.AUREL_STORAGE!=='postgres'){
  db.users.push(create({id:'admin',name:'Quản trị viên',username:'admin',role:'admin',passwordHash:hashPassword(process.env.DEMO_ADMIN_PASSWORD||'AurelDemo@2026')}));
 }
 // Normalize spreadsheet-like project/building, owner and tenant names into editable entities.
 if(!db.buildings.length){for(const p of db.projects){for(const code of (p.buildings||[])){db.buildings.push(create({id:`building-${p.id}-${code}`,projectId:p.id,code,name:code,address:''}));}}}
 for(const u of db.units){if(!u.buildingId){const b=db.buildings.find(b=>b.projectId===u.projectId&&b.code===u.building);if(b)u.buildingId=b.id;}}
 if(!db.clients.length){const seen=new Map();for(const u of db.units){for(const [field,type,idField] of [['owner','owner','ownerId'],['tenant','tenant','tenantId']]){const name=u[field]?.trim();if(!name)continue;const key=type+':'+name.toLowerCase();if(!seen.has(key)){const c=create({name,type,code:'',phone:'',email:'',address:'',notes:''});db.clients.push(c);seen.set(key,c.id)}u[idField]=seen.get(key);}}}
 if(!db.leases.length){for(const u of db.units){if(u.leaseStart&&u.leaseEnd){db.leases.push({id:'lease-'+u.id,unitId:u.id,tenantName:u.tenant||'',startsOn:u.leaseStart,endsOn:u.leaseEnd,rent:u.rent,paymentDay:u.paymentDay||1,depositExpected:u.deposit??0,status:u.status==='ended'?'ended':'active',createdAt:new Date().toISOString()})}}}
 for(const u of db.units){if(u.feePercent!=null&&!db.feeHistory.some(h=>h.unitId===u.id))db.feeHistory.push(create({unitId:u.id,percent:u.feePercent,basis:u.feeBasis||'due',effectiveFrom:u.leaseStart||'2026-01-01',reason:'Giá trị ban đầu'}));}
 for(const lease of db.leases){if(lease.status!=='archived')generateSchedules(db,lease)}
 // Earlier spreadsheet periods were not imported with receipts: do not label them overdue.
 for(const sch of db.schedules){if(sch.period<'2026-11'&&sch.status==='open')sch.status='historical';}
 for(const pay of db.payments){if(!pay.scheduleId){const schedule=db.schedules.find(s=>s.unitId===pay.unitId&&s.period===pay.period);if(schedule)pay.scheduleId=schedule.id;}if(!pay.leaseId&&pay.scheduleId){const sched=db.schedules.find(s=>s.id===pay.scheduleId);if(sched)pay.leaseId=sched.leaseId;}if(!pay.status)pay.status='posted';}
 // No implicit deposit transaction: an expected deposit is not proof of receipt.
 db.version=9;return db;
}
// JSON is for disposable demos, but even those records must not be truncated when
// a process crashes mid-write. Flush a unique temporary file before replacing it.
function jsonWrite(next){
 fs.mkdirSync(dir,{recursive:true});
 const tmp=path.join(dir,`.local-demo.${process.pid}.${randomUUID()}.tmp`);
 let fd;
 try{
  fd=fs.openSync(tmp,'wx',0o600);
  fs.writeFileSync(fd,JSON.stringify(next,null,2));fs.fsyncSync(fd);
  fs.closeSync(fd);fd=undefined;
  fs.renameSync(tmp,file);
  // Syncing the directory is supported on Unix and best-effort on Windows.
  let directoryFd;try{directoryFd=fs.openSync(dir,'r');fs.fsyncSync(directoryFd)}catch{}finally{if(directoryFd!==undefined)fs.closeSync(directoryFd)}
  state=next;
 }catch(error){if(fd!==undefined)fs.closeSync(fd);try{fs.unlinkSync(tmp)}catch{}throw error}
}
async function jsonRead(){
 if(state)return state;
 fs.mkdirSync(dir,{recursive:true});
 if(!fs.existsSync(file)){jsonWrite(upgrade(seed()));return state}
 const stored=JSON.parse(fs.readFileSync(file,'utf8'));
 const needsMigration=!Number.isInteger(stored.version)||stored.version<9;
 const next=upgrade(stored);
 // Opening an up-to-date database must be strictly read-only, avoiding unnecessary
 // rewrites, modified timestamps and an extra opportunity to damage the file.
 if(needsMigration)jsonWrite(next);else state=next;
 return state;
}
async function getPool(){if(pool)return pool;const {Pool}=await import('pg');pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PG_SSL==='true'?{rejectUnauthorized:true}:undefined,max:10});return pool;}
function pgOpts(name,item){switch(name){
 case 'buildings':return [item.projectId||null,null,null];
 case 'floors':case 'rooms':return [item.projectId||null,null,null];
 case 'units':return [item.projectId||null,null,null];
 case 'leases':return [null,item.unitId||null,null];
 case 'schedules':return [null,item.unitId||null,item.leaseId||null];
 case 'payments':return [null,item.unitId||null,item.leaseId||null];
 case 'depositTransactions':return [null,item.unitId||null,item.leaseId||null];
 case 'feeHistory':return [null,item.unitId||null,null];
 case 'reminderContacts':return [null,item.unitId||null,item.leaseId||null];
 case 'reminderNotifications':return [null,item.unitId||null,item.leaseId||null];
 case 'depositSettlements':return [null,item.unitId||null,item.leaseId||null];
 case 'paymentAttachments':return [null,item.unitId||null,item.leaseId||null];
 default:return [null,null,null];
}}
async function pgRead(client){const next={version:9,preferences:{company:'AUREL Property',defaultFee:6,reminderDays:5}};
 for(const name of names){const order=name==='audit'?"ORDER BY data->>'time' DESC NULLS LAST, id":"ORDER BY data->>'createdAt' ASC NULLS LAST, id";
  const {rows}=await client.query(`SELECT data FROM ${table[name]} ${order}`);next[name]=rows.map(r=>r.data)}
 const p=await client.query("SELECT value FROM app_settings WHERE key='preferences'");if(p.rows[0])next.preferences=p.rows[0].value;
 return next;
}
export async function getDb(){if(process.env.AUREL_STORAGE==='postgres'){const pg=await getPool();const client=await pg.connect();try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const data=await pgRead(client);await client.query('COMMIT');return data;}catch(err){await client.query('ROLLBACK');throw err}finally{client.release()}}
 // In JSON demo mode the cached state is private. Returning it by reference lets a
 // read-only caller silently change future reads without an updateDb transaction.
 return structuredClone(await jsonRead());
}
export async function updateDb(operation){if(process.env.AUREL_STORAGE!=='postgres'){
 // Serialize JSON-demo writes: overlapping requests must not overwrite another transaction.
 const run=jsonTail.then(async()=>{const copy=structuredClone(await jsonRead());const result=await operation(copy);jsonWrite(copy);
  // A returned entity may be a reference into copy; never leak that writable
  // reference back to callers after committing the new cached snapshot.
  return structuredClone(result);
 });
 jsonTail=run.then(()=>undefined,()=>undefined);return run;
 }
 const pg=await getPool(),client=await pg.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(945001)');
 const before=await pgRead(client),next=structuredClone(before),result=await operation(next);
 // Upsert in FK dependency order; archival is soft except expired sessions.
 for(const name of names){const old=new Map(before[name].map(v=>[v.id,JSON.stringify(v)])),now=new Set();
 for(const item of next[name]){now.add(item.id);if(old.get(item.id)===JSON.stringify(item))continue;
 const [projectId,unitId,leaseId]=pgOpts(name,item);
 await client.query(`INSERT INTO ${table[name]} (id,data,project_id,unit_id,lease_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data,project_id=EXCLUDED.project_id,unit_id=EXCLUDED.unit_id,lease_id=EXCLUDED.lease_id`,[item.id,item,projectId,unitId,leaseId]);
 }}
 for(const name of [...names].reverse())for(const item of before[name])if(!next[name].some(x=>x.id===item.id))await client.query(`DELETE FROM ${table[name]} WHERE id=$1`,[item.id]);
 if(JSON.stringify(before.preferences)!==JSON.stringify(next.preferences))await client.query("INSERT INTO app_settings(key,value) VALUES('preferences',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[next.preferences]);
 await client.query('COMMIT');return result;
 }catch(err){await client.query('ROLLBACK');throw err}finally{client.release()}
}
export async function bootstrapAdmin(){
 const password=process.env.ADMIN_INITIAL_PASSWORD;
 if(!password)return;
 if(password.length<12)throw Error('ADMIN_INITIAL_PASSWORD phải có tối thiểu 12 ký tự');
 await updateDb(db=>{if(db.users.length)return;db.users.push(create({id:'admin',name:'Quản trị viên',username:process.env.ADMIN_USERNAME||'admin',role:'admin',passwordHash:hashPassword(password)}));});
}
export async function resetDb(){
 if(process.env.AUREL_STORAGE==='postgres')throw Error('Không reset tự động dữ liệu PostgreSQL');
 // A demo reset must be serialized with pending writes. Otherwise a slow update
 // can overwrite the freshly reset store after resetDb has already returned.
 const run=jsonTail.then(()=>{const copy=upgrade(seed());jsonWrite(copy);return structuredClone(copy)});
 jsonTail=run.then(()=>undefined,()=>undefined);
 return run;
}
